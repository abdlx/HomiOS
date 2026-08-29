import { prisma } from './config/prisma.js'
import { hashToken, randomToken } from './utils/crypto.js'
import { hashPassword } from './utils/password.js'

const scopes = ['files:read', 'files:write', 'files:upload', 'storage:read', 'accounts:manage']

export async function bootstrapHomiCloudStorage(secret: string) {
  if (secret.length < 32) throw new Error('Internal HomiOS cloud key is invalid')
  const email = 'cloud-storage@homios.internal'
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: 'HomiOS Cloud Storage', passwordHash: await hashPassword(randomToken(32)) },
    update: { status: 'active' },
  })
  const keyHash = hashToken(secret)
  await prisma.apiKey.upsert({
    where: { keyHash },
    create: { userId: user.id, name: 'HomiOS internal storage engine', keyPrefix: secret.slice(0, 16), keyHash, scopes },
    update: { userId: user.id, scopes, status: 'active', revokedAt: null },
  })
}
