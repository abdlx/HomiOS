import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { requireApiKey } from '../../middleware/api-key.middleware.js'
import { handleUpload } from '../uploads/upload.routes.js'
import { fileRouter } from '../files/file.routes.js'
import { folderRouter } from '../folders/folder.routes.js'
import { storageRouter } from '../storage/storage.routes.js'
import { connectedAccountRouter } from '../connected-accounts/connected-account.routes.js'
import { prisma } from '../../config/prisma.js'
import { decryptText, encryptText } from '../../utils/crypto.js'

export const publicApiRouter = Router()

function requireReadOrWrite(req: Request, res: Response, next: NextFunction) {
  return requireApiKey(req.method === 'GET' || req.method === 'HEAD' ? 'files:read' : 'files:write')(req, res, next)
}

publicApiRouter.post('/v1/uploads', requireApiKey('files:upload'), handleUpload)

// These are the headless integration surfaces. The API-key middleware selects
// the owning workspace, then the existing routers enforce their normal
// per-user queries and provider behavior. HomiOS owns the complete user experience.
publicApiRouter.use('/v1/files', requireReadOrWrite, fileRouter)
publicApiRouter.use('/v1/folders', requireReadOrWrite, folderRouter)
publicApiRouter.use('/v1/storage', requireApiKey('storage:read'), storageRouter)
publicApiRouter.use('/v1/accounts', requireApiKey('accounts:manage'), connectedAccountRouter)

publicApiRouter.get('/v1/system/google-config', requireApiKey('accounts:manage'), async (req, res, next) => {
  try {
    const config = await prisma.providerConfig.findFirst({
      where: { userId: null, provider: 'google_drive', status: 'active' },
      orderBy: { createdAt: 'desc' },
    })
    if (!config) return res.json({ exists: false, hasSecret: false })
    let clientId = ''
    try { clientId = decryptText(config.clientIdEncrypted) } catch {}
    return res.json({ exists: true, clientId, redirectUri: config.redirectUri, hasSecret: Boolean(config.clientSecretEncrypted) })
  } catch (error) { return next(error) }
})

publicApiRouter.post('/v1/system/google-config', requireApiKey('accounts:manage'), async (req, res, next) => {
  try {
    const clientId = String(req.body?.clientId || '').trim()
    const redirectUri = String(req.body?.redirectUri || '').trim()
    if (!clientId || !redirectUri) return res.status(400).json({ code: 'BAD_REQUEST', message: 'Client ID and redirect URI are required.' })
    const previous = await prisma.providerConfig.findFirst({
      where: { userId: null, provider: 'google_drive', status: 'active' },
      orderBy: { createdAt: 'desc' },
    })
    let clientSecret = String(req.body?.clientSecret || '')
    if (!clientSecret && previous) {
      try { clientSecret = decryptText(previous.clientSecretEncrypted) } catch {}
    }
    if (!clientSecret) return res.status(400).json({ code: 'BAD_REQUEST', message: 'Client Secret is required for first-time setup.' })
    await prisma.$transaction(async (tx) => {
      await tx.providerConfig.updateMany({ where: { userId: null, provider: 'google_drive', status: 'active' }, data: { status: 'disabled' } })
      await tx.providerConfig.create({ data: {
        userId: null,
        provider: 'google_drive',
        clientIdEncrypted: encryptText(clientId),
        clientSecretEncrypted: encryptText(clientSecret),
        redirectUri,
        scopes: [
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile',
        ],
        status: 'active',
      } })
    })
    return res.status(201).json({ status: 'success' })
  } catch (error) { return next(error) }
})
