import {
  applyCloudStorageEnvironment,
  migrateCloudStorageDatabase,
} from '../lib/cloud-storage-runtime.ts';

const runtime = applyCloudStorageEnvironment();
migrateCloudStorageDatabase();
const [{ bootstrapHomiCloudStorage }, { prisma }] = await Promise.all([
  import('../internal/cloud-storage-engine/dist/bootstrap.js'),
  import('../internal/cloud-storage-engine/dist/config/prisma.js'),
]);

try {
  await bootstrapHomiCloudStorage(runtime.internalKey);
  console.log(JSON.stringify({ apiKeys: await prisma.apiKey.count(), users: await prisma.user.count() }));
} finally {
  await prisma.$disconnect();
}
