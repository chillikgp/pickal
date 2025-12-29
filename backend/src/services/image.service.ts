/**
 * Image Processing Service
 * 
 * Handles image optimization and LQIP generation.
 * Uses Sharp for high-performance image processing.
 */

import sharp from 'sharp';

export interface ProcessedImage {
    webBuffer: Buffer;
    lqipBase64: string;
    width: number;
    height: number;
    format: string;
}

export class ImageService {
    private readonly WEB_MAX_WIDTH = 1920;
    private readonly WEB_MAX_HEIGHT = 1920;
    private readonly WEB_QUALITY = 80;

    private readonly LQIP_SIZE = 32;
    private readonly LQIP_BLUR = 5;

    /**
     * Process an uploaded image:
     * - Generate web-optimized version (1920px max, 80% quality)
     * - Generate LQIP (32px, blurred, base64)
     */
    async processImage(buffer: Buffer): Promise<ProcessedImage> {
        const image = sharp(buffer);
        const metadata = await image.metadata();

        // Generate web-optimized version
        const webBuffer = await image
            .resize(this.WEB_MAX_WIDTH, this.WEB_MAX_HEIGHT, {
                fit: 'inside',
                withoutEnlargement: true,
            })
            .jpeg({ quality: this.WEB_QUALITY, progressive: true })
            .toBuffer();

        // Generate LQIP (Low-Quality Image Placeholder)
        const lqipBuffer = await sharp(buffer)
            .resize(this.LQIP_SIZE, this.LQIP_SIZE, { fit: 'inside' })
            .blur(this.LQIP_BLUR)
            .jpeg({ quality: 20 })
            .toBuffer();

        const lqipBase64 = `data:image/jpeg;base64,${lqipBuffer.toString('base64')}`;

        // Get dimensions of web version
        const webMetadata = await sharp(webBuffer).metadata();

        return {
            webBuffer,
            lqipBase64,
            width: webMetadata.width || metadata.width || 0,
            height: webMetadata.height || metadata.height || 0,
            format: 'jpeg',
        };
    }

    /**
     * Get image metadata without processing
     */
    async getMetadata(buffer: Buffer): Promise<{
        width: number;
        height: number;
        format: string;
    }> {
        const metadata = await sharp(buffer).metadata();
        return {
            width: metadata.width || 0,
            height: metadata.height || 0,
            format: metadata.format || 'unknown',
        };
    }
}

// Singleton instance
export const imageService = new ImageService();
