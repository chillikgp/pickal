/**
 * Storage Service Interface
 * 
 * Abstracts file storage operations. Implementations:
 * - MockStorageService: Local filesystem storage for development
 * - S3StorageService: AWS S3 + CloudFront for production
 */

export type StorageBucket = 'originals' | 'web' | 'lqip';

export interface UploadResult {
    key: string;
    url: string;
    bucket: StorageBucket;
}

export interface IStorageService {
    /**
     * Upload a file to storage
     * @param buffer - File buffer to upload
     * @param filename - Original filename (used to generate key)
     * @param bucket - Target bucket/folder (originals, web, or lqip)
     * @returns Upload result with storage key and URL
     */
    upload(buffer: Buffer, filename: string, bucket: StorageBucket): Promise<UploadResult>;

    /**
     * Get a signed URL for accessing a file
     * @param key - Storage key of the file
     * @param expiresIn - URL expiration time in seconds (default: 3600)
     * @returns Signed URL for accessing the file
     */
    getSignedUrl(key: string, expiresIn?: number): Promise<string>;

    /**
     * Delete a file from storage
     * @param key - Storage key of the file to delete
     */
    delete(key: string): Promise<void>;

    /**
     * Check if a file exists
     * @param key - Storage key to check
     */
    exists(key: string): Promise<boolean>;
}
