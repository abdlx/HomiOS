import {
  applyCloudStorageEnvironment,
  migrateCloudStorageDatabase,
} from '../lib/cloud-storage-runtime.ts';

const homiosDatabaseUrl = process.env.DATABASE_URL;
const runtime = applyCloudStorageEnvironment();
migrateCloudStorageDatabase();
let bootstrapHomiCloudStorage;
let prisma;
try {
  [{ bootstrapHomiCloudStorage }, { prisma }] = await Promise.all([
    import('../internal/cloud-storage-engine/dist/bootstrap.js'),
    import('../internal/cloud-storage-engine/dist/config/prisma.js'),
  ]);
} finally {
  runtime.restore();
}
if (process.env.DATABASE_URL !== homiosDatabaseUrl) throw new Error('Cloud engine leaked its database configuration into HomiOS');

try {
  await bootstrapHomiCloudStorage(runtime.internalKey);
  console.log(JSON.stringify({ apiKeys: await prisma.apiKey.count(), users: await prisma.user.count() }));
} finally {
  await prisma.$disconnect();
}
