/**
 * Face Recognition Routes
 * 
 * Selfie upload and face matching.
 * Used for guest access mode.
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import sharp from 'sharp';
import { prisma } from '../index.js';
import { badRequest, notFound, forbidden } from '../middleware/error.middleware.js';
import { getFaceRecognitionService, getStorageService } from '../services/index.js';

const router = Router();

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 20 * 1024 * 1024, // 20MB
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    },
});

const guestAccessSchema = z.object({
    galleryId: z.string().uuid(),
    mobileNumber: z.string().min(10).max(15).optional(),
    guestSessionToken: z.string().uuid().optional(),  // Browser-generated fallback ID
});

interface MulterRequest extends Request {
    file?: Express.Multer.File;
}

/**
 * POST /api/face/guest-access
 * Upload selfie and create guest session
 * Returns matched photos and session token
 * 
 * Cost optimization: Uses perceptual hashing to cache face detection results.
 * Same selfie uploaded twice will reuse cached results (no Rekognition call).
 */
router.post(
    '/guest-access',
    upload.single('selfie'),
    async (req: MulterRequest, res: Response, next: NextFunction) => {
        try {
            if (!req.file) {
                throw badRequest('No selfie provided');
            }

            const data = guestAccessSchema.parse(req.body);

            // Verify gallery exists and allows guest access
            const gallery = await prisma.gallery.findUnique({
                where: { id: data.galleryId },
                select: {
                    id: true,
                    accessModes: true,
                    name: true,
                    selfieMatchingEnabled: true,
                    requireMobileForSelfie: true,
                },
            });

            if (!gallery) {
                throw notFound('Gallery not found');
            }

            // Hard guardrail: Check if selfie matching is enabled
            if (!gallery.selfieMatchingEnabled) {
                console.log(`[FACE] Selfie matching DISABLED for gallery ${data.galleryId}`);
                throw forbidden('Selfie matching is disabled for this gallery');
            }

            if (!gallery.accessModes.includes('GUEST_SELFIE')) {
                throw forbidden('Guest access is not enabled for this gallery');
            }

            // Enforce mobile requirement if enabled
            if (gallery.requireMobileForSelfie && !data.mobileNumber) {
                return res.status(400).json({
                    error: 'MOBILE_REQUIRED',
                    message: 'Mobile number is required for selfie access'
                });
            }

            // Compute robust guestSessionId
            const normalizedMobile = data.mobileNumber?.replace(/\D/g, '') || '';
            const guestSessionId = normalizedMobile
                ? `${data.galleryId}:m:${normalizedMobile}`
                : data.guestSessionToken
                    ? `${data.galleryId}:s:${data.guestSessionToken}`
                    : null;

            // Validate BEFORE rate limiting
            if (!guestSessionId) {
                return res.status(400).json({
                    error: 'INVALID_GUEST_SESSION',
                    message: 'Either mobile number or session token is required'
                });
            }
            console.log(`[FACE] Using guestSessionId: ${guestSessionId}`);

            // Resize image for web optimization and consistency
            const processedBuffer = await sharp(req.file.buffer)
                .resize({ width: 1000, withoutEnlargement: true })
                .jpeg({ quality: 80 })
                .toBuffer();

            // Generate perceptual hash of the selfie
            const { generateImageHash } = await import('../services/hash.service.js');
            const imageHash = await generateImageHash(processedBuffer);
            console.log(`[FACE] Generated hash for selfie: ${imageHash}`);

            // Rate Limit Check (Postgres)
            const { RateLimitService } = await import('../services/rate-limit.service.js');
            const limitResult = await RateLimitService.checkSelfieLimit(data.galleryId, guestSessionId);

            if (!limitResult.allowed) {
                console.warn(`[RATE_LIMIT] Selfie attempt blocked for gallery ${data.galleryId} (guestSessionId: ${guestSessionId})`);
                // Handle invalid session vs rate limit exceeded
                if (limitResult.error?.includes('INVALID_GUEST_SESSION')) {
                    return res.status(400).json({ error: 'INVALID_GUEST_SESSION', message: limitResult.error });
                }
                return res.status(429).json({
                    error: 'RATE_LIMIT_EXCEEDED',
                    message: limitResult.error,
                    retryAfter: limitResult.resetInSeconds
                });
            }

            // Layered lookup for selfie reuse:
            const { selfieCacheService } = await import('../services/selfie-cache.service.js');
            const storageService = getStorageService();

            let cachedFace = null;
            let selfieS3Key: string | null = null;
            let selfieUrl: string | undefined;

            // Priority 1: Mobile lookup
            if (normalizedMobile) {
                cachedFace = await selfieCacheService.lookupByMobile(data.galleryId, normalizedMobile);
                if (cachedFace) {
                    console.log(`[FACE] Mobile reuse HIT - gallery: ${data.galleryId}, mobile: ${normalizedMobile.slice(-4)}`);
                }
            }

            // Priority 2: Session lookup
            if (!cachedFace && data.guestSessionToken) {
                cachedFace = await selfieCacheService.lookupBySessionToken(data.galleryId, data.guestSessionToken);
                if (cachedFace) {
                    console.log(`[FACE] Session reuse HIT - gallery: ${data.galleryId}, token: ${data.guestSessionToken.slice(0, 8)}...`);
                }
            }

            // Priority 3: Hash lookup (existing behavior)
            if (!cachedFace) {
                cachedFace = await selfieCacheService.lookupCachedFace(data.galleryId, imageHash);
                if (cachedFace) {
                    console.log(`[FACE] Hash reuse HIT - gallery: ${data.galleryId}, hash: ${imageHash.slice(0, 8)}...`);
                }
            }

            let matchedPhotoIds: string[];
            let faceId: string;
            let cacheHit = false;

            if (cachedFace) {
                // CACHE HIT: Reuse cached results
                console.log(`[FACE] Reusing cached faceId: ${cachedFace.faceId}, matchedPhotos: ${cachedFace.matchedPhotoIds.length}`);

                matchedPhotoIds = cachedFace.matchedPhotoIds;
                faceId = cachedFace.faceId;
                selfieS3Key = cachedFace.selfieS3Key; // Retrieve existing key
                cacheHit = true;

                // Update last_used_at for cache tracking
                await selfieCacheService.updateLastUsed(cachedFace.id);
            } else {
                // CACHE MISS: Call Rekognition
                console.log(`[FACE] Cache MISS - gallery: ${data.galleryId}, calling Rekognition`);

                // Upload resized selfie and capture key
                const uploadResult = await storageService.upload(
                    processedBuffer,
                    `selfie-${Date.now()}.jpg`, // filename is mostly ignored by storage service random key gen
                    'originals'
                );
                selfieS3Key = uploadResult.key;
                console.log(`[FACE] Uploaded selfie to S3: ${selfieS3Key}`);

                // Search for matching faces
                const faceService = getFaceRecognitionService();
                console.log(`[REKOGNITION] SearchFacesByImage - gallery: ${data.galleryId}, reason: cache_miss`);

                const matches = await faceService.searchFaces(
                    processedBuffer,
                    data.galleryId,
                    80 // 80% threshold
                );

                console.log(`[FACE] Found ${matches.length} matches:`, matches.map(m => ({ photoId: m.photoId, similarity: m.similarity })));
                matchedPhotoIds = matches.map(m => m.photoId);
                faceId = matches.length > 0 ? matches[0].matchedFaceId : `no-match-${Date.now()}`;

                // Cache the result (with S3 key)
                await selfieCacheService.cacheFace(
                    data.galleryId,
                    imageHash,
                    faceId,
                    matchedPhotoIds,
                    normalizedMobile || undefined,
                    data.guestSessionToken,
                    selfieS3Key
                );
                console.log(`[FACE] Cached face result - hash: ${imageHash.slice(0, 8)}..., faceId: ${faceId}, key: ${selfieS3Key}`);
            }

            // Generate signed URL if key exists
            if (selfieS3Key) {
                try {
                    selfieUrl = await storageService.getSignedUrl(selfieS3Key);
                } catch (err) {
                    console.warn(`[FACE] Failed to generate signed URL for key ${selfieS3Key}:`, err);
                }
            }

            // Get matched photo details
            const matchedPhotos = await prisma.photo.findMany({
                where: { id: { in: matchedPhotoIds } },
                select: { id: true, filename: true },
            });
            console.log(`[FACE] Matched photos:`, matchedPhotos.map(p => p.filename));

            // Create guest session
            const guest = await prisma.guest.create({
                data: {
                    mobileNumber: data.mobileNumber,
                    selfieKey: cacheHit ? undefined : `cached-${imageHash}`,
                    matchedPhotoIds,
                    galleryId: data.galleryId,
                },
                select: {
                    id: true,
                    sessionToken: true,
                    matchedPhotoIds: true,
                },
            });

            res.json({
                sessionToken: guest.sessionToken,
                matchedCount: matchedPhotoIds.length,
                matchedPhotos: matchedPhotos.map(p => ({ id: p.id, filename: p.filename })),
                gallery: {
                    id: gallery.id,
                    name: gallery.name,
                },
                selfieUrl, // Return signed URL
                cacheHit,
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                next(badRequest(error.errors[0].message));
            } else {
                next(error);
            }
        }
    }
);

/**
 * POST /api/face/update-matches
 * Re-run face matching for an existing guest
 * Useful if new photos were added after initial access
 */
router.post('/update-matches', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const sessionToken = req.headers['x-session-token'] as string;

        if (!sessionToken) {
            throw forbidden('No session token provided');
        }

        const guest = await prisma.guest.findUnique({
            where: { sessionToken },
            select: { id: true, selfieKey: true, galleryId: true },
        });

        if (!guest || !guest.selfieKey) {
            throw notFound('Guest session not found');
        }

        // Get selfie from storage and re-run matching
        // Note: In a real implementation, we'd retrieve the selfie buffer
        // For mock purposes, we'll just return the existing matches

        res.json({
            message: 'Matches updated',
            matchedCount: (await prisma.guest.findUnique({
                where: { id: guest.id },
                select: { matchedPhotoIds: true },
            }))?.matchedPhotoIds.length ?? 0,
        });
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// MOBILE_SELFIE_REUSE: New endpoints for mobile-based selfie reuse
// ============================================================================

/**
 * POST /api/face/check-mobile
 * Check if a returning user exists for this mobile + gallery
 * If yes, returns session without requiring selfie upload
 * 
 * MOBILE_SELFIE_REUSE: This is called BEFORE selfie upload to enable reuse
 */
router.post('/check-mobile', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const schema = z.object({
            galleryId: z.string().uuid(),
            mobileNumber: z.string().min(10).max(15),
        });
        const data = schema.parse(req.body);

        // Verify gallery exists and allows selfie access
        const gallery = await prisma.gallery.findUnique({
            where: { id: data.galleryId },
            select: {
                id: true,
                name: true,
                selfieMatchingEnabled: true,
            },
        });

        if (!gallery || !gallery.selfieMatchingEnabled) {
            return res.json({ found: false });
        }

        // MOBILE REUSE LOOKUP
        const existingSelfie = await prisma.guestSelfieFace.findFirst({
            where: {
                galleryId: data.galleryId,
                mobileNumber: data.mobileNumber,
            },
            orderBy: { lastUsedAt: 'desc' },
            select: {
                id: true,
                matchedPhotoIds: true,
                selfieS3Key: true, // NEW
            },
        });

        if (existingSelfie) {
            console.log(`[FACE] Mobile reuse HIT - gallery: ${data.galleryId}, mobile: ${data.mobileNumber.slice(-4)}`);

            // Update last used
            await prisma.guestSelfieFace.update({
                where: { id: existingSelfie.id },
                data: { lastUsedAt: new Date() },
            });

            // Create guest session with cached matches
            const guest = await prisma.guest.create({
                data: {
                    mobileNumber: data.mobileNumber,
                    matchedPhotoIds: existingSelfie.matchedPhotoIds,
                    galleryId: data.galleryId,
                },
                select: { sessionToken: true },
            });

            // Generate signed URL if key exists
            let selfieUrl: string | undefined;
            if (existingSelfie.selfieS3Key) {
                try {
                    const storageService = getStorageService();
                    selfieUrl = await storageService.getSignedUrl(existingSelfie.selfieS3Key);
                } catch (err) {
                    console.warn(`[FACE] Failed to generate signed URL for key ${existingSelfie.selfieS3Key}:`, err);
                }
            }

            return res.json({
                found: true,
                sessionToken: guest.sessionToken,
                matchedCount: existingSelfie.matchedPhotoIds.length,
                gallery: { id: gallery.id, name: gallery.name },
                selfieUrl, // NEW
            });
        }

        // No mobile match found
        console.log(`[FACE] Mobile reuse MISS - gallery: ${data.galleryId}, mobile: ${data.mobileNumber.slice(-4)}`);
        res.json({ found: false });
    } catch (error) {
        if (error instanceof z.ZodError) {
            next(badRequest(error.errors[0].message));
        } else {
            next(error);
        }
    }
});

/**
 * POST /api/face/invalidate-selfie
 * Called when user clicks "Change selfie"
 * Removes the mobile + hash mapping for THIS user only
 * 
 * MOBILE_SELFIE_REUSE: Allows user to re-upload selfie
 */
router.post('/invalidate-selfie', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const schema = z.object({
            galleryId: z.string().uuid(),
            mobileNumber: z.string().min(10).max(15),
        });
        const data = schema.parse(req.body);

        // Delete only THIS user's cached selfie for this gallery
        const result = await prisma.guestSelfieFace.deleteMany({
            where: {
                galleryId: data.galleryId,
                mobileNumber: data.mobileNumber,
            },
        });

        console.log(`[FACE] Invalidated selfie for mobile: ${data.mobileNumber.slice(-4)} in gallery: ${data.galleryId} (deleted: ${result.count})`);

        res.json({ success: true, deletedCount: result.count });
    } catch (error) {
        if (error instanceof z.ZodError) {
            next(badRequest(error.errors[0].message));
        } else {
            next(error);
        }
    }
});

export default router;
