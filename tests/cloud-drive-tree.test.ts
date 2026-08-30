import { describe, expect, it } from 'vitest'
import {
  googleDriveFolderMimeType,
  reachableMyDriveItems,
  type DriveTreeItem,
} from '../internal/cloud-storage-engine/src/modules/google/drive-tree.ts'
import { cloudMarker } from '../lib/cloud-drive.ts'

const file = (input: Partial<DriveTreeItem> & Pick<DriveTreeItem, 'id' | 'name' | 'parentId'>): DriveTreeItem => ({
  mimeType: 'text/plain',
  sizeBytes: 1n,
  ...input,
})

describe('Google My Drive tree projection', () => {
  it('keeps nested My Drive items and excludes Shared with me items', () => {
    const items = [
      file({ id: 'folder-a', name: 'Projects', parentId: 'root-id', mimeType: googleDriveFolderMimeType }),
      file({ id: 'nested-file', name: 'plan.txt', parentId: 'folder-a' }),
      file({ id: 'shared-file', name: 'shared.txt', parentId: 'someone-elses-folder' }),
    ]

    expect(reachableMyDriveItems('root-id', items).map((item) => item.id)).toEqual(['folder-a', 'nested-file'])
  })

  it('does not loop forever on malformed cyclic folder metadata', () => {
    const items = [
      file({ id: 'folder-a', name: 'A', parentId: 'root-id', mimeType: googleDriveFolderMimeType }),
      file({ id: 'folder-b', name: 'B', parentId: 'folder-a', mimeType: googleDriveFolderMimeType }),
      file({ id: 'folder-a', name: 'A duplicate', parentId: 'folder-b', mimeType: googleDriveFolderMimeType }),
    ]

    expect(reachableMyDriveItems('root-id', items).map((item) => item.id)).toEqual(['folder-a', 'folder-b'])
  })
})

describe('Cloud Drive virtual markers', () => {
  it('recognizes account, folder, and file marker paths', () => {
    expect(cloudMarker('Cloud Drive/.homios-cloud/account/account-1')).toEqual({ kind: 'account', id: 'account-1' })
    expect(cloudMarker('Cloud Drive/.homios-cloud/folder/folder-1')).toEqual({ kind: 'folder', id: 'folder-1' })
    expect(cloudMarker('Cloud Drive/.homios-cloud/file/file-1')).toEqual({ kind: 'file', id: 'file-1' })
  })
})
