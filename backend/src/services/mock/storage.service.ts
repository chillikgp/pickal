/**
 * Mock Storage Service
 * 
 * Local filesystem implementation for development.
 * Saves files to /uploads folder and serves them directly.
 */

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { IStorageService, StorageBucket, UploadResult } from '../interfaces/storage.interface.js';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export class MockStorageService implements IStorageService {
    private baseUrl: string;

    constructor() {
        this.baseUrl = `http://localhost:${process.env.PORT || 3001}/uploads`;
        this.ensureDirectories();
    }

    private async ensureDirectories() {
        const dirs = ['originals', 'web', 'lqip'];
        for (const dir of dirs) {
            await fs.mkdir(path.join(UPLOADS_DIR, dir), { recursive: true });
        }
    }

    async upload(buffer: Buffer, filename: string, bucket: StorageBucket): Promise<UploadResult> {
        await this.ensureDirectories();

        // Generate unique filename
        const ext = path.extname(filename);
        const uniqueFilename = `${uuid()}${ext}`;
        const key = `${bucket}/${uniqueFilename}`;
        const filePath = path.join(UPLOADS_DIR, key);

        // Write file
        await fs.writeFile(filePath, buffer);

        return {
            key,
            url: `${this.baseUrl}/${key}`,
            bucket,
        };
    }

    async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
        // In mock mode, just return direct URL (no signing needed)
        return `${this.baseUrl}/${key}`;
    }

    async delete(key: string): Promise<void> {
        const filePath = path.join(UPLOADS_DIR, key);
        try {
            await fs.unlink(filePath);
        } catch (error) {
            // Ignore if file doesn't exist
        }
    }

    async exists(key: string): Promise<boolean> {
        const filePath = path.join(UPLOADS_DIR, key);
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }
}

// Singleton instance
export const mockStorageService = new MockStorageService();
