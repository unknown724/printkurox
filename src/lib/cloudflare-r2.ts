/**
 * Cloudflare R2 S3-Compatible Client
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '948fd75d8b84a5cf20559d6aa789d4dd';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '4a952eb1b22509358c27e7f8dbfc3d83';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '55b0fbbcbf8ce5bedd4a3e135c652404bf3277c619efa784da8982bd1d7792ef';
const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'kiosk-uploads';

export const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export async function uploadToR2(key: string, buffer: Buffer, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });
  return await s3.send(command);
}

export async function getDownloadUrl(key: string, expiresIn = 900) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  return await getSignedUrl(s3, command, { expiresIn });
}

export async function deleteFromR2(key: string) {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  return await s3.send(command);
}

export async function purgeExpiredR2Files(maxAgeMinutes = 15) {
  const listCmd = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
  });
  const data = await s3.send(listCmd);
  const now = Date.now();
  const maxAgeMs = maxAgeMinutes * 60 * 1000;

  if (data.Contents && data.Contents.length > 0) {
    for (const item of data.Contents) {
      if (item.Key && item.LastModified) {
        const age = now - item.LastModified.getTime();
        if (age > maxAgeMs) {
          await deleteFromR2(item.Key);
        }
      }
    }
  }
}
