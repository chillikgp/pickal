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
    selfieS3Key: string | null;  // NEW
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
            selfieS3Key: true, // NEW
        },
    });

    return cached;
}

/**
 * Look up cached face by gallery + mobile number.
 * Used for mobile-based selfie reuse.
 */
export async function lookupByMobile(
    galleryId: string,
    mobileNumber: string
): Promise<CachedFace | null> {
    if (!mobileNumber) return null;

    const cached = await prisma.guestSelfieFace.findFirst({
        where: {
            galleryId,
            mobileNumber,
        },
        orderBy: { lastUsedAt: 'desc' },
        select: {
            id: true,
            faceId: true,
            matchedPhotoIds: true,
            createdAt: true,
            lastUsedAt: true,
            selfieS3Key: true, // NEW
        },
    });

    return cached;
}

/**
 * Look up cached face by gallery + session token.
 * Used for session-based selfie reuse when mobile is absent.
 */
export async function lookupBySessionToken(
    galleryId: string,
    guestSessionToken: string
): Promise<CachedFace | null> {
    if (!guestSessionToken) return null;

    const cached = await prisma.guestSelfieFace.findFirst({
        where: {
            galleryId,
            guestSessionToken,
        },
        orderBy: { lastUsedAt: 'desc' },
        select: {
            id: true,
            faceId: true,
            matchedPhotoIds: true,
            createdAt: true,
            lastUsedAt: true,
            selfieS3Key: true, // NEW
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
 * @param mobileNumber - Optional mobile number for mobile-based reuse
 * @param guestSessionToken - Optional session token for session-based reuse
 * @param selfieS3Key - Optional S3 key for the selfie image
 */
export async function cacheFace(
    galleryId: string,
    hash: string,
    faceId: string,
    matchedPhotoIds: string[],
    mobileNumber?: string,
    guestSessionToken?: string,
    selfieS3Key?: string // NEW
): Promise<CachedFace> {
    const cached = await prisma.guestSelfieFace.create({
        data: {
            galleryId,
            faceHash: hash,
            faceId,
            matchedPhotoIds,
            mobileNumber,
            guestSessionToken,
            selfieS3Key, // NEW
        },
        select: {
            id: true,
            faceId: true,
            matchedPhotoIds: true,
            createdAt: true,
            lastUsedAt: true,
            selfieS3Key: true, // NEW
        },
    });
    return cached;
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
    lookupByMobile,
    lookupBySessionToken,
    updateLastUsed,
    cacheFace,
    clearGalleryCache,
};
