import { app } from './app.js'
import { env } from './config/env.js'

app.listen(env.APP_PORT, () => {
  console.log(`HomiOS cloud storage engine running on http://localhost:${env.APP_PORT}`)
})
