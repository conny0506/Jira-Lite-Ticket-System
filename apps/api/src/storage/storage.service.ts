import { Injectable } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

type DownloadTarget =
  | { mode: 'local'; path: string }
  | { mode: 'redirect'; url: string };

@Injectable()
export class StorageService {
  private readonly driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
  private readonly uploadDir = join(process.cwd(), 'uploads');
  private readonly s3Bucket = process.env.S3_BUCKET ?? '';
  private readonly s3Region = process.env.S3_REGION ?? 'auto';
  private readonly s3Endpoint = process.env.S3_ENDPOINT ?? '';
  private readonly signedUrlTtlSeconds = Number(
    process.env.S3_SIGNED_URL_TTL_SECONDS ?? 300,
  );
  private readonly s3Client =
    this.driver === 's3'
      ? new S3Client({
          region: this.s3Region,
          endpoint: this.s3Endpoint || undefined,
          forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'false') === 'true',
          credentials:
            process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
              ? {
                  accessKeyId: process.env.S3_ACCESS_KEY_ID,
                  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
                }
              : undefined,
        })
      : null;

  async storeSubmissionFile(file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
  }) {
    const extension = this.extractExtension(file.originalname);
    const key = `${randomUUID()}${extension}`;

    if (this.driver === 's3') {
      if (!this.s3Client || !this.s3Bucket) {
        throw new Error('S3 storage is enabled but S3 env vars are missing');
      }
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.s3Bucket,
          Key: key,
          Body: file.buffer,
          ContentType: this.normalizeMimeType(file.mimetype, extension),
          Metadata: {
            originalname: file.originalname,
          },
        }),
      );
      return { storageName: key };
    }

    await mkdir(this.uploadDir, { recursive: true });
    const path = join(this.uploadDir, key);
    await writeFile(path, file.buffer);
    return { storageName: key };
  }

  async resolveDownloadTarget(
    storageName: string,
    fileName: string,
    mimeType: string,
  ): Promise<DownloadTarget> {
    if (this.driver === 's3') {
      if (!this.s3Client || !this.s3Bucket) {
        throw new Error('S3 storage is enabled but S3 env vars are missing');
      }
      const url = await getSignedUrl(
        this.s3Client,
        new GetObjectCommand({
          Bucket: this.s3Bucket,
          Key: storageName,
          ResponseContentType: mimeType,
          ResponseContentDisposition: `attachment; filename="${encodeURIComponent(fileName)}"`,
        }),
        { expiresIn: this.signedUrlTtlSeconds },
      );
      return { mode: 'redirect', url };
    }

    return { mode: 'local', path: join(this.uploadDir, storageName) };
  }

  private extractExtension(name: string) {
    const dot = name.lastIndexOf('.');
    if (dot < 0) return '';
    return name.slice(dot).toLowerCase();
  }

  private normalizeMimeType(input: string, extension: string) {
    if (input && input !== 'application/octet-stream') return input;
    const map: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx':
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };
    return map[extension] ?? 'application/octet-stream';
  }
}
