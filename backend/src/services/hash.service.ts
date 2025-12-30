/**
 * Image Hash Service
 * 
 * Generates perceptual hashes for images using Sharp.
 * Uses average hash (aHash) algorithm for fast, simple image fingerprinting.
 * 
 * Algorithm:
 * 1. Resize image to 8x8 pixels
 * 2. Convert to grayscale
 * 3. Calculate average pixel value
 * 4. Generate 64-bit hash: 1 if pixel > average, 0 otherwise
 */

import sharp from 'sharp';

/**
 * Generate a perceptual hash (aHash) for an image buffer.
 * Returns a 64-character hex string representing the image fingerprint.
 * 
 * @param buffer - Image buffer to hash
 * @returns 16-character hex string (64 bits)
 */
export async function generateImageHash(buffer: Buffer): Promise<string> {
    try {
        // Resize to 8x8 grayscale
        const { data } = await sharp(buffer)
            .resize(8, 8, { fit: 'fill' })
            .grayscale()
            .raw()
            .toBuffer({ resolveWithObject: true });

        // Calculate average pixel value
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i];
        }
        const average = sum / data.length;

        // Generate binary hash: 1 if pixel > average, 0 otherwise
        let hash = '';
        for (let i = 0; i < data.length; i++) {
            hash += data[i] > average ? '1' : '0';
        }

        // Convert binary string to hex
        const hexHash = BigInt('0b' + hash).toString(16).padStart(16, '0');

        return hexHash;
    } catch (error) {
        console.error('[HASH] Failed to generate image hash:', error);
        // Return a hash of the buffer content as fallback
        const crypto = await import('crypto');
        return crypto.createHash('md5').update(buffer).digest('hex').slice(0, 16);
    }
}

/**
 * Calculate Hamming distance between two hashes.
 * Lower distance = more similar images.
 * 
 * @param hash1 - First hex hash
 * @param hash2 - Second hex hash
 * @returns Number of differing bits (0-64)
 */
export function hammingDistance(hash1: string, hash2: string): number {
    const bin1 = BigInt('0x' + hash1).toString(2).padStart(64, '0');
    const bin2 = BigInt('0x' + hash2).toString(2).padStart(64, '0');

    let distance = 0;
    for (let i = 0; i < 64; i++) {
        if (bin1[i] !== bin2[i]) {
            distance++;
        }
    }
    return distance;
}

/**
 * Check if two hashes are similar (within threshold).
 * Default threshold of 5 bits allows for minor variations like
 * JPEG compression artifacts.
 * 
 * @param hash1 - First hex hash
 * @param hash2 - Second hex hash
 * @param threshold - Maximum Hamming distance to consider similar
 * @returns True if images are similar
 */
export function areSimilar(hash1: string, hash2: string, threshold = 5): boolean {
    return hammingDistance(hash1, hash2) <= threshold;
}
