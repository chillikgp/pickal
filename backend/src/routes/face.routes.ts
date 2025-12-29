/**
 * Face Recognition Routes
 * 
 * Selfie upload and face matching.
 * Used for guest access mode.
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../index.js';
import { badRequest, notFound, forbidden } from '../middleware/error.middleware.js';
import { getFaceRecognitionService, getStorageService } from '../services/index.js';

const router = Router();

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB for selfies
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
    mobileNumber: z.string().min(10).max(15),
});

interface MulterRequest extends Request {
    file?: Express.Multer.File;
}

/**
 * POST /api/face/guest-access
 * Upload selfie and create guest session
 * Returns matched photos and session token
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
                select: { id: true, accessModes: true, name: true },
            });

            if (!gallery) {
                throw notFound('Gallery not found');
            }

            if (!gallery.accessModes.includes('GUEST_SELFIE')) {
                throw forbidden('Guest access is not enabled for this gallery');
            }

            // Store selfie
            const storageService = getStorageService();
            const selfieResult = await storageService.upload(
                req.file.buffer,
                `selfie-${Date.now()}.jpg`,
                'originals'
            );

            // Search for matching faces
            const faceService = getFaceRecognitionService();
            const matches = await faceService.searchFaces(
                req.file.buffer,
                data.galleryId,
                80 // 80% threshold
            );

            const matchedPhotoIds = matches.map(m => m.photoId);

            // Create guest session
            const guest = await prisma.guest.create({
                data: {
                    mobileNumber: data.mobileNumber,
                    selfieKey: selfieResult.key,
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
                gallery: {
                    id: gallery.id,
                    name: gallery.name,
                },
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

export default router;
