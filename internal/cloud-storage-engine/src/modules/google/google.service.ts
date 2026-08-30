import { google } from 'googleapis'
import type { ConnectedAccount, ProviderConfig } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { decryptText, encryptText } from '../../utils/crypto.js'
import { googleDriveFolderMimeType, reachableMyDriveItems, type DriveTreeItem } from './drive-tree.js'

const appFolderName = 'HomiOS Cloud Drive'

export function createOAuthClient(config: ProviderConfig) {
  return new google.auth.OAuth2(decryptText(config.clientIdEncrypted), decryptText(config.clientSecretEncrypted), config.redirectUri)
}

export async function getAuthedGoogleClient(account: ConnectedAccount) {
  if (!account.accessTokenEncrypted || !account.refreshTokenEncrypted || !account.tokenExpiresAt) throw new Error('Google account tokens are missing.')
  if (!account.providerConfigId) throw new Error('Google provider config is missing.')
  const config = await prisma.providerConfig.findUniqueOrThrow({ where: { id: account.providerConfigId } })
  const client = createOAuthClient(config)
  client.setCredentials({
    access_token: decryptText(account.accessTokenEncrypted),
    refresh_token: decryptText(account.refreshTokenEncrypted),
    expiry_date: account.tokenExpiresAt.getTime(),
  })

  if (account.tokenExpiresAt.getTime() < Date.now() + 60_000) {
    const result = await client.refreshAccessToken()
    const credentials = result.credentials
    if (credentials.access_token) {
      await prisma.connectedAccount.update({
        where: { id: account.id },
        data: {
          accessTokenEncrypted: encryptText(credentials.access_token),
          tokenExpiresAt: new Date(credentials.expiry_date ?? Date.now() + 3600_000),
        },
      })
      client.setCredentials(credentials)
    }
  }

  return client
}

export async function syncGoogleQuota(accountId: string) {
  const account = await prisma.connectedAccount.findUniqueOrThrow({ where: { id: accountId } })
  const auth = await getAuthedGoogleClient(account)
  const drive = google.drive({ version: 'v3', auth })
  const about = await drive.about.get({ fields: 'storageQuota,user' })
  const quota = about.data.storageQuota
  const total = quota?.limit ? BigInt(quota.limit) : null
  const used = quota?.usage ? BigInt(quota.usage) : 0n
  return prisma.storageAccount.upsert({
    where: { connectedAccountId: accountId },
    create: {
      connectedAccountId: accountId,
      totalBytes: total,
      usedBytes: used,
      availableBytes: total === null ? null : total - used,
      trashBytes: quota?.usageInDriveTrash ? BigInt(quota.usageInDriveTrash) : null,
      lastSyncedAt: new Date(),
    },
    update: {
      totalBytes: total,
      usedBytes: used,
      availableBytes: total === null ? null : total - used,
      trashBytes: quota?.usageInDriveTrash ? BigInt(quota.usageInDriveTrash) : null,
      lastSyncedAt: new Date(),
    },
  })
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export async function ensureGoogleAppFolder(account: ConnectedAccount) {
  const auth = await getAuthedGoogleClient(account)
  const drive = google.drive({ version: 'v3', auth })
  const queryName = escapeDriveQueryValue(appFolderName)
  const existing = await drive.files.list({
    q: `name = '${queryName}' and mimeType = '${googleDriveFolderMimeType}' and 'root' in parents and trashed = false`,
    spaces: 'drive',
    fields: 'files(id,name)',
    pageSize: 1,
  })
  const folderId = existing.data.files?.[0]?.id ?? (await drive.files.create({
    requestBody: { name: appFolderName, mimeType: googleDriveFolderMimeType, parents: ['root'] },
    fields: 'id',
  })).data.id

  if (!folderId) throw new Error('Failed to create Google Drive app folder.')
  return folderId
}

export type GoogleDriveSyncResult = {
  accountId: string
  created: number
  updated: number
  deleted: number
  foldersCreated: number
  foldersUpdated: number
  foldersDeleted: number
}

/** Mirror the account's My Drive hierarchy into HomiOS metadata. */
export async function syncGoogleDriveFiles(accountId: string, userId: string): Promise<GoogleDriveSyncResult> {
  const account = await prisma.connectedAccount.findFirstOrThrow({ where: { id: accountId, userId, provider: 'google_drive', status: 'connected' } })
  const auth = await getAuthedGoogleClient(account)
  const drive = google.drive({ version: 'v3', auth })
  const root = await drive.files.get({ fileId: 'root', fields: 'id' })
  const rootId = root.data.id
  if (!rootId) throw new Error('Google Drive did not return the My Drive root ID.')

  const allItems: DriveTreeItem[] = []
  let pageToken: string | undefined
  do {
    const response = await drive.files.list({
      q: 'trashed = false',
      corpora: 'user',
      spaces: 'drive',
      fields: 'nextPageToken,files(id,name,mimeType,size,parents)',
      pageSize: 1000,
      pageToken,
    })
    for (const file of response.data.files ?? []) {
      if (!file.id || !file.name || !file.mimeType) continue
      allItems.push({ id: file.id, name: file.name, mimeType: file.mimeType, sizeBytes: BigInt(file.size ?? 0), parentId: file.parents?.[0] ?? null })
    }
    pageToken = response.data.nextPageToken ?? undefined
  } while (pageToken)

  // The user corpus also includes "Shared with me". Retain only items whose
  // parent chain is reachable from this account's actual My Drive root.
  const reachable = reachableMyDriveItems(rootId, allItems)

  const driveFolders = reachable.filter((item) => item.mimeType === googleDriveFolderMimeType)
  const driveFiles = reachable.filter((item) => item.mimeType !== googleDriveFolderMimeType)
  const existingFolders = await prisma.folder.findMany({ where: { userId, connectedAccountId: account.id, provider: 'google_drive' } })
  const existingFolderByProviderId = new Map(existingFolders.filter((folder) => folder.providerFolderId).map((folder) => [folder.providerFolderId!, folder]))
  const folderIdByProviderId = new Map<string, string>()
  let foldersCreated = 0
  let foldersUpdated = 0

  // Reachability traversal is breadth-first, so parent folders are mapped first.
  for (const driveFolder of driveFolders) {
    const parentId = driveFolder.parentId === rootId ? null : (driveFolder.parentId ? folderIdByProviderId.get(driveFolder.parentId) ?? null : null)
    const existing = existingFolderByProviderId.get(driveFolder.id)
    if (!existing) {
      const folder = await prisma.folder.create({
        data: {
          userId,
          connectedAccountId: account.id,
          provider: 'google_drive',
          providerFolderId: driveFolder.id,
          parentId,
          name: driveFolder.name,
          color: '#3b82f6',
          iconUrl: 'https://api.iconify.design/lucide:folder.svg',
        },
      })
      folderIdByProviderId.set(driveFolder.id, folder.id)
      foldersCreated += 1
      continue
    }
    folderIdByProviderId.set(driveFolder.id, existing.id)
    if (existing.name !== driveFolder.name || existing.parentId !== parentId || existing.deletedAt !== null) {
      await prisma.folder.update({ where: { id: existing.id }, data: { name: driveFolder.name, parentId, deletedAt: null } })
      foldersUpdated += 1
    }
  }

  const existingFiles = await prisma.file.findMany({ where: { userId, connectedAccountId: account.id, provider: 'google_drive' } })
  const existingByProviderId = new Map(existingFiles.map((file) => [file.providerFileId, file]))
  let created = 0
  let updated = 0
  let deleted = 0
  for (const driveFile of driveFiles) {
    const dbFolderId = driveFile.parentId === rootId ? null : (driveFile.parentId ? folderIdByProviderId.get(driveFile.parentId) ?? null : null)
    const existing = existingByProviderId.get(driveFile.id)
    if (!existing) {
      await prisma.file.create({
        data: { userId, connectedAccountId: account.id, provider: 'google_drive', providerFileId: driveFile.id, name: driveFile.name, mimeType: driveFile.mimeType, sizeBytes: driveFile.sizeBytes, status: 'active', folderId: dbFolderId },
      })
      created += 1
      continue
    }
    const needsUpdate = existing.name !== driveFile.name || existing.mimeType !== driveFile.mimeType || existing.sizeBytes !== driveFile.sizeBytes || existing.status !== 'active' || existing.deletedAt !== null || existing.folderId !== dbFolderId
    if (needsUpdate) {
      await prisma.file.update({
        where: { id: existing.id },
        data: { name: driveFile.name, mimeType: driveFile.mimeType, sizeBytes: driveFile.sizeBytes, status: 'active', deletedAt: null, folderId: dbFolderId },
      })
      updated += 1
    }
  }

  const driveFileIds = new Set(driveFiles.map((file) => file.id))
  const missingActiveIds = existingFiles.filter((file) => file.status === 'active' && !driveFileIds.has(file.providerFileId)).map((file) => file.id)
  if (missingActiveIds.length > 0) {
    const result = await prisma.file.updateMany({ where: { id: { in: missingActiveIds }, userId, connectedAccountId: account.id }, data: { status: 'deleted', deletedAt: new Date() } })
    deleted = result.count
  }

  const driveFolderIds = new Set(driveFolders.map((folder) => folder.id))
  const missingFolderIds = existingFolders.filter((folder) => folder.providerFolderId && folder.deletedAt === null && !driveFolderIds.has(folder.providerFolderId)).map((folder) => folder.id)
  let foldersDeleted = 0
  if (missingFolderIds.length > 0) {
    const result = await prisma.folder.updateMany({ where: { id: { in: missingFolderIds }, userId, connectedAccountId: account.id }, data: { deletedAt: new Date() } })
    foldersDeleted = result.count
  }

  await syncGoogleQuota(account.id).catch(() => undefined)
  return { accountId: account.id, created, updated, deleted, foldersCreated, foldersUpdated, foldersDeleted }
}
