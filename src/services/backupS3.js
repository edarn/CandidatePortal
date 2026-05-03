import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

let cachedClient = null;

async function getClient() {
  if (!config.s3) return null;
  if (cachedClient) return cachedClient;
  const { S3Client } = await import('@aws-sdk/client-s3');
  cachedClient = new S3Client({
    endpoint: config.s3.endpoint || undefined,
    region: config.s3.region,
    credentials: {
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey,
    },
    forcePathStyle: Boolean(config.s3.endpoint),
  });
  return cachedClient;
}

export async function pushBackupToS3(filePath) {
  const client = await getClient();
  if (!client) return null;
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const Key = `backups/${path.basename(filePath)}`;
  const Body = fs.createReadStream(filePath);
  await client.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key,
      Body,
    }),
  );
  return Key;
}
