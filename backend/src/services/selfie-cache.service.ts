/**
 * Selfie Face Cache Service
 * 
 * Manages caching of face detection results to avoid redundant Rekognition calls.
 * Implements face deduplication using perceptual hashing.
 * 
 * Key features:
 * - Lookup cached face by gallery + image hash
 * - Cache new face detection results
 * - Update last_used_at for cache hits
 * - All operations are gallery-scoped (no cross-gallery face reuse)
 */

import { prisma } from '../index.js';

export interface CachedFace {
    id: string;
    faceId: string;
    matchedPhotoIds: string[];
    createdAt: Date;
    lastUsedAt: Date;
}

/**
 * Look up a cached face by gallery and image hash.
 * Returns null if no cache exists.
 * 
 * @param galleryId - Gallery to search within
 * @param hash - Perceptual hash of the selfie image
 * @returns Cached face data or null
 */
export async function lookupCachedFace(
    galleryId: string,
    hash: string
): Promise<CachedFace | null> {
    const cached = await prisma.guestSelfieFace.findUnique({
        where: {
            galleryId_faceHash: {
                galleryId,
                faceHash: hash,
            },
        },
        select: {
            id: true,
            faceId: true,
            matchedPhotoIds: true,
            createdAt: true,
            lastUsedAt: true,
        },
    });

    return cached;
}

/**
 * Update the last_used_at timestamp for a cached face.
 * Called when a cache hit occurs.
 * 
 * @param id - Cache record ID
 */
export async function updateLastUsed(id: string): Promise<void> {
    await prisma.guestSelfieFace.update({
        where: { id },
        data: { lastUsedAt: new Date() },
    });
}

/**
 * Cache a new face detection result.
 * 
 * @param galleryId - Gallery the face belongs to
 * @param hash - Perceptual hash of the selfie image
 * @param faceId - Rekognition face ID
 * @param matchedPhotoIds - Photo IDs that matched this face
 */
export async function cacheFace(
    galleryId: string,
    hash: string,
    faceId: string,
    matchedPhotoIds: string[]
): Promise<void> {
    await prisma.guestSelfieFace.create({
        data: {
            galleryId,
            faceHash: hash,
            faceId,
            matchedPhotoIds,
        },
    });
}

/**
 * Delete all cached faces for a gallery.
 * Called when a gallery is deleted.
 * 
 * @param galleryId - Gallery to clean up
 */
export async function clearGalleryCache(galleryId: string): Promise<void> {
    await prisma.guestSelfieFace.deleteMany({
        where: { galleryId },
    });
}

// Export as service object for consistency with other services
export const selfieCacheService = {
    lookupCachedFace,
    updateLastUsed,
    cacheFace,
    clearGalleryCache,
};
