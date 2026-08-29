import express from 'express'
import { errorMiddleware } from './middleware/error.middleware.js'
import { connectedAccountRouter } from './modules/connected-accounts/connected-account.routes.js'
import { publicApiRouter } from './modules/public-api/public-api.routes.js'

export const app = express()
app.set('trust proxy', true)

app.use(express.json({ limit: '1mb' }))

app.get('/health', (_req, res) => res.json({ status: 'ok' }))
app.use('/api', publicApiRouter)
// The callback is relayed through HomiOS. All storage operations use the
// scoped internal API above; no standalone product UI or public admin API exists.
app.use('/connected-accounts', connectedAccountRouter)
app.use(errorMiddleware)
