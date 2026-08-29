import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { requireApiKey } from '../../middleware/api-key.middleware.js'
import { handleUpload } from '../uploads/upload.routes.js'
import { fileRouter } from '../files/file.routes.js'
import { folderRouter } from '../folders/folder.routes.js'
import { storageRouter } from '../storage/storage.routes.js'
import { connectedAccountRouter } from '../connected-accounts/connected-account.routes.js'

export const publicApiRouter = Router()

function requireReadOrWrite(req: Request, res: Response, next: NextFunction) {
  return requireApiKey(req.method === 'GET' || req.method === 'HEAD' ? 'files:read' : 'files:write')(req, res, next)
}

publicApiRouter.post('/v1/uploads', requireApiKey('files:upload'), handleUpload)

// These are the headless integration surfaces. The API-key middleware selects
// the owning workspace, then the existing routers enforce their normal
// per-user queries and provider behavior. No 9Drive frontend is involved.
publicApiRouter.use('/v1/files', requireReadOrWrite, fileRouter)
publicApiRouter.use('/v1/folders', requireReadOrWrite, folderRouter)
publicApiRouter.use('/v1/storage', requireApiKey('storage:read'), storageRouter)
publicApiRouter.use('/v1/accounts', requireApiKey('accounts:manage'), connectedAccountRouter)
