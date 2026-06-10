/**
 * S3-compatible backup storage (AWS, MinIO, Backblaze B2, Wasabi...).
 * Credentials are encrypted at rest in s3_storages.
 */
import fs from 'fs';
import { getDb } from './db.ts';
import { decryptSecret } from './crypto.ts';

async function clientFor(storage: any) {
  // Lazy import keeps the AWS SDK out of the boot path.
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    region: storage.region || 'us-east-1',
    endpoint: storage.endpoint || undefined,
    forcePathStyle: !!storage.endpoint, // MinIO & friends need path-style
    credentials: {
      accessKeyId: decryptSecret(storage.access_key_enc),
      secretAccessKey: decryptSecret(storage.secret_key_enc),
    },
  });
}

export async function uploadBackupToS3(storageId: string, localPath: string, key: string): Promise<void> {
  const storage = getDb().prepare('SELECT * FROM s3_storages WHERE id = ?').get(storageId) as any;
  if (!storage) throw new Error('S3 storage not found');
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await clientFor(storage);
  await client.send(new PutObjectCommand({
    Bucket: storage.bucket,
    Key: `openfinder-backups/${key}`,
    Body: fs.createReadStream(localPath),
  }));
}

export async function testS3Storage(storageId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const storage = getDb().prepare('SELECT * FROM s3_storages WHERE id = ?').get(storageId) as any;
    if (!storage) return { ok: false, error: 'Storage not found' };
    const { HeadBucketCommand } = await import('@aws-sdk/client-s3');
    const client = await clientFor(storage);
    await client.send(new HeadBucketCommand({ Bucket: storage.bucket }));
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
