/**
 * AWS S3 Storage Service
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { IStorageService, StorageBucket, UploadResult } from '../interfaces/storage.interface.js';
import { v4 as uuid } from 'uuid';
import path from 'path';

export class S3StorageService implements IStorageService {
    private client: S3Client;
    private bucketName: string;
    private baseUrl: string;

    constructor() {
        this.client = new S3Client({
            region: process.env.AWS_REGION || 'ap-south-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
            },
        });
        this.bucketName = process.env.S3_BUCKET!;

        if (process.env.CLOUDFRONT_DOMAIN) {
            this.baseUrl = `https://${process.env.CLOUDFRONT_DOMAIN}`;
        } else {
            this.baseUrl = `https://${this.bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com`;
        }

        if (!this.bucketName) {
            throw new Error('S3_BUCKET environment variable is required');
        }
    }

    async upload(buffer: Buffer, filename: string, bucket: StorageBucket): Promise<UploadResult> {
        const ext = path.extname(filename);
        const key = `${bucket}/${uuid()}${ext}`;

        await this.client.send(new PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            Body: buffer,
            ContentType: this.getContentType(ext),
        }));

        return {
            key,
            url: `${this.baseUrl}/${key}`,
            bucket,
        };
    }

    async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
        if (process.env.CLOUDFRONT_DOMAIN) {
            return `${this.baseUrl}/${key}`;
        }
        const command = new GetObjectCommand({ Bucket: this.bucketName, Key: key });
        return getSignedUrl(this.client, command, { expiresIn });
    }

    async delete(key: string): Promise<void> {
        await this.client.send(new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: key,
        }));
    }

    async exists(key: string): Promise<boolean> {
        try {
            await this.client.send(new HeadObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            }));
            return true;
        } catch {
            return false;
        }
    }

    async getStream(key: string): Promise<import('stream').Readable> {
        const command = new GetObjectCommand({
            Bucket: this.bucketName,
            Key: key,
        });
        const response = await this.client.send(command);
        // S3 response.Body is a Readable stream
        return response.Body as import('stream').Readable;
    }

    private getContentType(ext: string): string {
        const types: Record<string, string> = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
            '.gif': 'image/gif', '.webp': 'image/webp',
        };
        return types[ext.toLowerCase()] || 'application/octet-stream';
    }
}

export const s3StorageService = new S3StorageService();
