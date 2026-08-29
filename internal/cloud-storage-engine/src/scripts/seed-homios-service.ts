import { prisma } from '../config/prisma.js'
import { hashToken, randomToken } from '../utils/crypto.js'
import { hashPassword } from '../utils/password.js'

const scopes = ['files:read', 'files:write', 'files:upload', 'storage:read', 'accounts:manage']

async function main() {
  const secret = process.env.HOMIOS_API_KEY?.trim()
  if (!secret) {
    console.warn('Skipping HomiOS service bootstrap: HOMIOS_API_KEY is not set.')
    return
  }
  if (secret.length < 32) throw new Error('HOMIOS_API_KEY must be at least 32 characters')
  const email = process.env.HOMIOS_SERVICE_USER_EMAIL?.trim() || 'cloud-storage@homios.internal'
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: 'HomiOS Cloud Storage', passwordHash: await hashPassword(randomToken(32)) },
    update: { status: 'active' },
  })
  const keyHash = hashToken(secret)
  await prisma.apiKey.upsert({
    where: { keyHash },
    create: { userId: user.id, name: 'HomiOS internal service', keyPrefix: secret.slice(0, 16), keyHash, scopes },
    update: { userId: user.id, scopes, status: 'active', revokedAt: null },
  })
  console.log('HomiOS headless storage service is ready.')
}

main().catch((error) => { console.error(error); process.exit(1) }).finally(() => prisma.$disconnect())
