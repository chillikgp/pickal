/**
 * Photo Routes
 * 
 * Upload, retrieve, and manage photos.
 * Access control:
 * - Upload/Delete: Photographer only
 * - View: Based on user role and gallery settings
 * - Download: Only if enabled by photographer, guests limited to matched photos
 */

import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../index.js';
import {
    requirePhotographer,
    requireAnyAuth,
    AuthenticatedRequest,
    canGuestAccessPhoto,
    isDownloadEnabled,
} from '../middleware/auth.middleware.js';
import { badRequest, notFound, forbidden } from '../middleware/error.middleware.js';
import { getStorageService, getFaceRecognitionService } from '../services/index.js';
import { imageService } from '../services/image.service.js';

const router = Router();

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    },
});

// Validation schemas
const uploadPhotoSchema = z.object({
    galleryId: z.string().uuid(),
    sectionId: z.string().uuid().optional(),
});

/**
 * POST /api/photos/upload
 * Upload a photo to a gallery
 * Photographer only
 * 
 * Process:
 * 1. Store original in S3/local
 * 2. Generate web-optimized version
 * 3. Generate LQIP
 * 4. Index faces for matching
 */
router.post(
    '/upload',
    requirePhotographer,
    upload.single('photo'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            if (!req.file) {
                throw badRequest('No photo file provided');
            }

            const data = uploadPhotoSchema.parse(req.body);

            // Verify gallery ownership
            const gallery = await prisma.gallery.findUnique({
                where: { id: data.galleryId },
                select: { photographerId: true },
            });

            if (!gallery) {
                throw notFound('Gallery not found');
            }

            if (gallery.photographerId !== req.photographer!.id) {
                throw forbidden('You do not own this gallery');
            }

            // Verify section if provided
            if (data.sectionId) {
                const section = await prisma.section.findUnique({
                    where: { id: data.sectionId },
                    select: { galleryId: true },
                });

                if (!section || section.galleryId !== data.galleryId) {
                    throw badRequest('Invalid section');
                }
            }

            // Process image
            const storageService = getStorageService();
            const faceService = getFaceRecognitionService();

            // 1. Upload original
            const originalResult = await storageService.upload(
                req.file.buffer,
                req.file.originalname,
                'originals'
            );

            // 2. Process and upload web version + LQIP
            const processed = await imageService.processImage(req.file.buffer);

            const webResult = await storageService.upload(
                processed.webBuffer,
                req.file.originalname.replace(/\.[^.]+$/, '.jpg'),
                'web'
            );

            // 3. Create photo record
            const photo = await prisma.photo.create({
                data: {
                    filename: req.file.originalname,
                    originalKey: originalResult.key,
                    webKey: webResult.key,
                    lqipBase64: processed.lqipBase64,
                    width: processed.width,
                    height: processed.height,
                    fileSize: req.file.size,
                    mimeType: req.file.mimetype,
                    galleryId: data.galleryId,
                    sectionId: data.sectionId,
                },
            });

            // 4. Index faces (async, don't wait)
            faceService.indexFaces(req.file.buffer, photo.id, data.galleryId)
                .catch(err => console.error('Face indexing failed:', err));

            res.status(201).json({
                photo: {
                    id: photo.id,
                    filename: photo.filename,
                    webUrl: await storageService.getSignedUrl(webResult.key),
                    lqipBase64: photo.lqipBase64,
                    width: photo.width,
                    height: photo.height,
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
 * GET /api/photos/gallery/:galleryId
 * Get all photos in a gallery
 * Access control applied based on user role
 */
router.get('/gallery/:galleryId', requireAnyAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { galleryId } = req.params;
        console.log(`[PHOTOS] GET /gallery/${galleryId} - userRole: ${req.userRole}`);
        if (req.guest) {
            console.log(`[PHOTOS] Guest session found - matchedPhotoIds: ${JSON.stringify(req.guest.matchedPhotoIds)}`);
        }

        // Verify access
        const gallery = await prisma.gallery.findUnique({
            where: { id: galleryId },
            select: { photographerId: true },
        });

        if (!gallery) {
            throw notFound('Gallery not found');
        }

        // Check access based on role
        if (req.userRole === 'photographer') {
            if (gallery.photographerId !== req.photographer!.id) {
                throw forbidden('You do not own this gallery');
            }
        } else if (req.userRole === 'primary_client') {
            if (req.primaryClient!.galleryId !== galleryId) {
                throw forbidden('You do not have access to this gallery');
            }
        } else if (req.userRole === 'guest') {
            if (req.guest!.galleryId !== galleryId) {
                throw forbidden('You do not have access to this gallery');
            }
        }

        // Get photos
        let photos = await prisma.photo.findMany({
            where: { galleryId },
            select: {
                id: true,
                filename: true,
                webKey: true,
                lqipBase64: true,
                width: true,
                height: true,
                sortOrder: true,
                sectionId: true,
                createdAt: true,
                _count: {
                    select: {
                        selections: true,
                        comments: true,
                    },
                },
            },
            orderBy: [
                { sortOrder: 'asc' },
                { createdAt: 'asc' },
            ],
        });

        // PERMISSION: Guests can only see their matched photos
        if (req.userRole === 'guest') {
            const matchedIds = req.guest!.matchedPhotoIds;
            console.log(`[PHOTOS] Guest filtering - matchedPhotoIds: ${JSON.stringify(matchedIds)}`);
            console.log(`[PHOTOS] Total photos before filter: ${photos.length}`);
            photos = photos.filter(p => matchedIds.includes(p.id));
            console.log(`[PHOTOS] Photos after filter: ${photos.length}`);
        }

        // Add signed URLs
        const storageService = getStorageService();
        const photosWithUrls = await Promise.all(
            photos.map(async (photo) => ({
                ...photo,
                webUrl: await storageService.getSignedUrl(photo.webKey),
            }))
        );

        res.json({ photos: photosWithUrls });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/photos/:id
 * Get a single photo with details
 */
router.get('/:id', requireAnyAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        const photo = await prisma.photo.findUnique({
            where: { id },
            include: {
                gallery: {
                    select: {
                        id: true,
                        photographerId: true,
                        downloadsEnabled: true,
                        downloadResolution: true,
                    },
                },
                section: {
                    select: { id: true, name: true },
                },
                selections: {
                    select: { id: true, primaryClientId: true },
                },
                comments: {
                    select: {
                        id: true,
                        content: true,
                        createdAt: true,
                        primaryClient: {
                            select: { id: true, name: true },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });

        if (!photo) {
            throw notFound('Photo not found');
        }

        // Check access
        if (req.userRole === 'photographer') {
            if (photo.gallery.photographerId !== req.photographer!.id) {
                throw forbidden('You do not own this photo');
            }
        } else if (req.userRole === 'primary_client') {
            if (req.primaryClient!.galleryId !== photo.galleryId) {
                throw forbidden('You do not have access to this photo');
            }
        } else if (req.userRole === 'guest') {
            // PERMISSION: Guests can only access matched photos
            if (!canGuestAccessPhoto(req.guest, id)) {
                throw forbidden('You do not have access to this photo');
            }
        }

        // Add signed URLs
        const storageService = getStorageService();
        const webUrl = await storageService.getSignedUrl(photo.webKey);

        res.json({
            photo: {
                ...photo,
                webUrl,
                gallery: undefined, // Don't expose full gallery object
                galleryId: photo.galleryId,
                downloadsEnabled: photo.gallery.downloadsEnabled,
                downloadResolution: photo.gallery.downloadResolution,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/photos/:id/download
 * Download photo (original or web quality)
 * 
 * PERMISSION:
 * - Downloads must be enabled by photographer
 * - Guests can only download their matched photos
 */
router.get('/:id/download', requireAnyAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        const photo = await prisma.photo.findUnique({
            where: { id },
            include: {
                gallery: {
                    select: {
                        id: true,
                        photographerId: true,
                        downloadsEnabled: true,
                        downloadResolution: true,
                    },
                },
            },
        });

        if (!photo) {
            throw notFound('Photo not found');
        }

        // PERMISSION: Check downloads are enabled
        if (!photo.gallery.downloadsEnabled) {
            throw forbidden('Downloads are not enabled for this gallery');
        }

        // Check access based on role
        if (req.userRole === 'photographer') {
            if (photo.gallery.photographerId !== req.photographer!.id) {
                throw forbidden('You do not own this photo');
            }
        } else if (req.userRole === 'primary_client') {
            if (req.primaryClient!.galleryId !== photo.galleryId) {
                throw forbidden('You do not have access to this photo');
            }
        } else if (req.userRole === 'guest') {
            // PERMISSION: Guests can ONLY download photos they matched with
            if (!canGuestAccessPhoto(req.guest, id)) {
                throw forbidden('You can only download photos you appear in');
            }
        }

        // Get the appropriate file key based on resolution setting
        const storageService = getStorageService();
        const key = photo.gallery.downloadResolution === 'original'
            ? photo.originalKey
            : photo.webKey;

        const downloadUrl = await storageService.getSignedUrl(key, 300); // 5 min expiry

        res.json({ downloadUrl });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/photos/:id
 * Delete a photo
 * Photographer only
 */
router.delete('/:id', requirePhotographer, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        const photo = await prisma.photo.findUnique({
            where: { id },
            include: {
                gallery: {
                    select: { photographerId: true },
                },
            },
        });

        if (!photo) {
            throw notFound('Photo not found');
        }

        if (photo.gallery.photographerId !== req.photographer!.id) {
            throw forbidden('You do not own this photo');
        }

        // Delete from storage
        const storageService = getStorageService();
        await storageService.delete(photo.originalKey);
        await storageService.delete(photo.webKey);

        // Delete face data
        const faceService = getFaceRecognitionService();
        await faceService.deleteFaces(id, photo.galleryId);

        // Delete photo record (cascades to selections, comments, etc.)
        await prisma.photo.delete({
            where: { id },
        });

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

export default router;
