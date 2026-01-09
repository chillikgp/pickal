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
} from '../middleware/auth.middleware.js';
import { badRequest, notFound, forbidden } from '../middleware/error.middleware.js';
import { getStorageService, getFaceRecognitionService } from '../services/index.js';
import { imageService } from '../services/image.service.js';
import {
    DownloadSettings,
    getEffectiveDownloads,
    checkDownloadAllowed,
    DOWNLOAD_ERROR_CODES,
    MAX_FAVORITES_DOWNLOAD,
} from '../types/download-settings.js';

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

// Validation schemas
const uploadPhotoSchema = z.object({
    galleryId: z.string().uuid(),
    sectionId: z.string().uuid().optional(),
});

// Max limits
const MAX_PHOTOS_PER_UPLOAD = 50;
const MAX_PHOTO_SIZE_MB = 20;

/**
 * POST /api/photos/upload
 * Upload a photo to a gallery
 * Photographer only
 * 
 * Process:
 * 1. Validate constraints (size, count)
 * 2. Store original in S3/local
 * 3. Generate web-optimized version
 * 4. Generate LQIP
 * 5. Index faces for matching
 */
router.post(
    '/upload',
    requirePhotographer,
    (req, res, next) => {
        // Custom upload middleware to enforce limits BEFORE multer processing
        // Note: Multer streams, so we can't check file count easily before processing.
        // However, we can check Content-Length header as a rough guardrail,
        // or rely on multer's limits.
        // For file count, multer 'array' or 'fields' would be needed for bulk,
        // but current implementation is 'single' file per request.
        // The user requirement says "Max bulk upload: 50 images per request".
        // If the frontend sends 50 separate requests, this backend limit on "per request"
        // is trivially satisfied (1 per request).
        // If the frontend sends 1 request with 50 files, we need to change upload.single() to upload.array().
        //
        // Assuming we want to support bulk upload in one request:
        const uploadMiddleware = upload.array('photos', MAX_PHOTOS_PER_UPLOAD); // Use array instead of single

        uploadMiddleware(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    console.warn(`[UPLOAD_LIMIT] File size limit exceeded: ${err.message}`);
                    return next(badRequest(`One or more files exceed the ${MAX_PHOTO_SIZE_MB}MB limit`));
                }
                if (err.code === 'LIMIT_FILE_COUNT') {
                    console.warn(`[UPLOAD_LIMIT] File count limit exceeded: ${err.message}`);
                    return next(badRequest(`Max ${MAX_PHOTOS_PER_UPLOAD} photos allowed per upload`));
                }
                console.warn(`[UPLOAD_ERROR] Multer error: ${err.message}`);
                return next(badRequest(err.message));
            } else if (err) {
                return next(err);
            }
            next();
        });
    },
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            // req.files is array because we switched to upload.array()
            const files = req.files as Express.Multer.File[];

            if (!files || files.length === 0) {
                throw badRequest('No photos provided');
            }

            // Double check limits just in case
            if (files.length > MAX_PHOTOS_PER_UPLOAD) {
                throw badRequest(`Max ${MAX_PHOTOS_PER_UPLOAD} photos allowed`);
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

            // Process all images in parallel (with some concurrency limit ideally, but Promise.all is ok for 50)
            const storageService = getStorageService();
            const faceService = getFaceRecognitionService();

            const processFile = async (file: Express.Multer.File) => {
                // 1. Upload original
                const originalResult = await storageService.upload(
                    file.buffer,
                    file.originalname,
                    'originals'
                );

                // 2. Process and upload web version + LQIP
                const processed = await imageService.processImage(file.buffer);

                const webResult = await storageService.upload(
                    processed.webBuffer,
                    file.originalname.replace(/\.[^.]+$/, '.jpg'),
                    'web'
                );

                // 3. Create photo record
                const photo = await prisma.photo.create({
                    data: {
                        filename: file.originalname,
                        originalKey: originalResult.key,
                        webKey: webResult.key,
                        lqipBase64: processed.lqipBase64,
                        width: processed.width,
                        height: processed.height,
                        fileSize: file.size,
                        mimeType: file.mimetype,
                        galleryId: data.galleryId,
                        sectionId: data.sectionId,
                    },
                });

                // 4. Index faces (async, don't wait)
                faceService.indexFaces(file.buffer, photo.id, data.galleryId)
                    .catch(err => console.error(`Face indexing failed for ${file.originalname}:`, err));

                return {
                    id: photo.id,
                    filename: photo.filename,
                    webUrl: await storageService.getSignedUrl(webResult.key),
                    lqipBase64: photo.lqipBase64,
                    width: photo.width,
                    height: photo.height,
                };
            };

            const uploadedPhotos = await Promise.all(files.map(processFile));

            res.status(201).json({
                success: true,
                count: uploadedPhotos.length,
                photos: uploadedPhotos
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
        const cursor = req.query.cursor as string | undefined;
        const limit = parseInt(req.query.limit as string || '50', 10);
        const sectionId = req.query.sectionId as string | undefined;
        const filter = req.query.filter as string | undefined;

        console.log(`[PHOTOS] GET /gallery/${galleryId} - cursor:${cursor} limit:${limit} section:${sectionId}`);

        // Verify access
        const gallery = await prisma.gallery.findUnique({
            where: { id: galleryId },
            select: { photographerId: true, coverPhotoId: true },
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

        // Build query
        const where: any = { galleryId };

        // PERMISSION: Guests can only see their matched photos
        // Optimized: Database-level filtering instead of in-memory
        if (req.userRole === 'guest') {
            const matchedIds = req.guest!.matchedPhotoIds;
            if (!matchedIds || matchedIds.length === 0) {
                // Determine if we should show ANY photos?
                // If matchedIds is empty, guest sees nothing.
                return res.json({ photos: [], nextCursor: null });
            }
            where.id = { in: matchedIds };
        }

        // Filter by section if provided
        if (sectionId && sectionId !== 'all') {
            where.sectionId = sectionId;
        }

        // Apply filters
        if (filter === 'selected' || filter === 'favorites') {
            where.selections = { some: {} };
        } else if (filter === 'comments') {
            where.comments = { some: {} };
        } else if (filter === 'cover') {
            if (gallery.coverPhotoId) {
                where.id = gallery.coverPhotoId;
            } else {
                return res.json({ photos: [], nextCursor: null, totalCount: 0 });
            }
        }

        // Get photos with cursor pagination
        const items = await prisma.photo.findMany({
            where,
            take: limit + 1, // Fetch one extra to check for next page
            skip: cursor ? 1 : 0,
            cursor: cursor ? { id: cursor } : undefined,
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
                        comments: true,
                    },
                },
                selections: { // Fetch selections to determine isSelected state
                    select: { id: true }
                }
            },
            orderBy: [
                { sortOrder: 'asc' },
                { createdAt: 'asc' },
                { id: 'asc' }
            ],
        });

        // Add signed URLs
        const storageService = getStorageService();
        const photosWithUrls = await Promise.all(items.map(async (photo) => {
            const url = await storageService.getSignedUrl(photo.webKey);
            return {
                ...photo,
                webUrl: url,
                originalFilename: photo.filename,
                isCover: photo.id === gallery.coverPhotoId,

                // Gallery-level selection state
                isSelected: photo.selections.length > 0,

                // Maintain favoritedCount for backward compatibility or UI (now just 0 or 1, or total selected?)
                // User requirement: "Counts = number of selected photos" (Dashboard)
                // "No isFavorited, no user-based computation"
                // Let's remove favoritedCount from individual photo response if not needed, 
                // OR set it to 1 if selected?
                // Dashboard uses explicit total count which is separate.
                // Attributes for UI:
                commentCount: photo._count.comments,
            };
        }));

        // Add this query to get the total count
        const totalCount = await prisma.photo.count({ where });

        let nextCursor: string | null = null;
        if (items.length > limit) {
            const nextItem = items.pop();
            nextCursor = nextItem!.id;
            // Remove the extra item from the response list
            photosWithUrls.pop();
        }

        res.json({
            photos: photosWithUrls,
            nextCursor,
            totalCount
        });
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
                        downloads: true, // DOWNLOAD_CONTROLS_V1
                        downloadResolution: true,
                    },
                },
                section: {
                    select: { id: true, name: true },
                },
                selections: {
                    select: { id: true },
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
                // DOWNLOAD_CONTROLS_V1: Expose downloads config for client
                downloads: photo.gallery.downloads,
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
 * DOWNLOAD_CONTROLS_V1: Role-based access control
 * - individual.enabled must be true
 * - User's role must match individual.allowedFor
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
                        downloads: true, // DOWNLOAD_CONTROLS_V1
                        downloadResolution: true,
                    },
                },
            },
        });

        if (!photo) {
            throw notFound('Photo not found');
        }

        // DOWNLOAD_CONTROLS_V1: Get effective download settings with defaults
        const downloads = getEffectiveDownloads(photo.gallery.downloads as Partial<DownloadSettings>);

        // Check access based on role
        if (req.userRole === 'photographer') {
            // Photographers can always download their own photos
            if (photo.gallery.photographerId !== req.photographer!.id) {
                throw forbidden('You do not own this photo');
            }
        } else if (req.userRole === 'primary_client') {
            // DOWNLOAD_CONTROLS_V1: Check individual download is enabled for clients
            if (!checkDownloadAllowed(downloads, 'individual', 'primary_client')) {
                throw forbidden({
                    message: 'Individual downloads are not enabled for this gallery',
                    code: DOWNLOAD_ERROR_CODES.INDIVIDUAL_DOWNLOAD_DISABLED
                } as any);
            }
            if (req.primaryClient!.galleryId !== photo.galleryId) {
                throw forbidden('You do not have access to this photo');
            }
        } else if (req.userRole === 'guest') {
            // DOWNLOAD_CONTROLS_V1: Check individual download is enabled for guests
            if (!checkDownloadAllowed(downloads, 'individual', 'guest')) {
                throw forbidden({
                    message: 'Individual downloads are not enabled for guests',
                    code: DOWNLOAD_ERROR_CODES.INDIVIDUAL_DOWNLOAD_DISABLED
                } as any);
            }
            // Guests can ONLY download photos they matched with
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
 * GET /api/photos/gallery/:galleryId/download-all
 * P0-5: Download all photos in a gallery as a ZIP file
 * 
 * DOWNLOAD_CONTROLS_V1: Role-based access control with abort-on-disconnect
 * - bulkAll.enabled must be true
 * - User's role must match bulkAll.allowedFor
 * - Guests can only download their matched photos
 * - Aborts ZIP generation if client disconnects (protects Cloud Run CPU)
 */
// =============================================================================
// BULK DOWNLOAD SAFETY CONSTANTS (v1.1)
// =============================================================================
const BULK_DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes hard timeout
const BULK_DOWNLOAD_MAX_SIZE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB soft limit

// Structured log type for observability
interface BulkDownloadLog {
    galleryId: string;
    photoCount: number;
    estimatedSizeBytes: number;
    actualBytesWritten: number;
    durationMs: number;
    aborted: boolean;
    abortedReason?: 'client_disconnect' | 'timeout' | 'size_limit';
}

/**
 * GET /api/photos/gallery/:galleryId/download-all
 * Download all photos as a streaming ZIP file
 * 
 * SAFETY HARDENING v1.1:
 * - Sequential file streaming (one photo at a time, backpressure-aware)
 * - Hard server-side timeout (10 minutes)
 * - Abort on client disconnect
 * - Soft size guard (5 GB pre-flight check)
 * - Structured observability logging
 */
router.get('/gallery/:galleryId/download-all', requireAnyAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const archiver = await import('archiver');
    const startTime = Date.now();
    let aborted = false;
    let abortReason: 'client_disconnect' | 'timeout' | 'size_limit' | undefined;
    let timeoutHandle: NodeJS.Timeout | undefined;
    let archive: ReturnType<typeof archiver.default> | undefined;

    // Prepare log entry (will be emitted once on completion/abort)
    const logEntry: BulkDownloadLog = {
        galleryId: '',
        photoCount: 0,
        estimatedSizeBytes: 0,
        actualBytesWritten: 0,
        durationMs: 0,
        aborted: false,
    };

    // Helper to emit structured log and cleanup
    const finalize = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        logEntry.durationMs = Date.now() - startTime;
        logEntry.aborted = aborted;
        if (abortReason) logEntry.abortedReason = abortReason;
        console.log(`[BULK_DOWNLOAD_LOG] ${JSON.stringify(logEntry)}`);
    };

    try {
        const { galleryId } = req.params;
        logEntry.galleryId = galleryId;

        const gallery = await prisma.gallery.findUnique({
            where: { id: galleryId },
            select: {
                id: true,
                name: true,
                photographerId: true,
                downloads: true,
                downloadResolution: true,
            },
        });

        if (!gallery) {
            throw notFound('Gallery not found');
        }

        // DOWNLOAD_CONTROLS_V1: Get effective download settings with defaults
        const downloads = getEffectiveDownloads(gallery.downloads as Partial<DownloadSettings>);

        // Check gallery access based on role
        if (req.userRole === 'photographer') {
            if (gallery.photographerId !== req.photographer!.id) {
                throw forbidden('You do not own this gallery');
            }
        } else if (req.userRole === 'primary_client') {
            if (!checkDownloadAllowed(downloads, 'bulkAll', 'primary_client')) {
                throw forbidden({
                    message: 'Bulk downloads are not enabled for this gallery',
                    code: DOWNLOAD_ERROR_CODES.BULK_DOWNLOAD_NOT_ALLOWED
                } as any);
            }
            if (req.primaryClient!.galleryId !== galleryId) {
                throw forbidden('You do not have access to this gallery');
            }
        } else if (req.userRole === 'guest') {
            if (!checkDownloadAllowed(downloads, 'bulkAll', 'guest')) {
                throw forbidden({
                    message: 'Bulk downloads are not enabled for guests',
                    code: DOWNLOAD_ERROR_CODES.BULK_DOWNLOAD_NOT_ALLOWED
                } as any);
            }
            if (req.guest!.galleryId !== galleryId) {
                throw forbidden('You do not have access to this gallery');
            }
        }

        // Get all photos with file sizes for pre-flight check
        let photos = await prisma.photo.findMany({
            where: { galleryId },
            select: {
                id: true,
                filename: true,
                originalKey: true,
                webKey: true,
                fileSize: true, // For size estimation
            },
            orderBy: [
                { sortOrder: 'asc' },
                { createdAt: 'asc' },
            ],
        });

        // PERMISSION: Guests can only download their matched photos
        if (req.userRole === 'guest') {
            const matchedIds = req.guest!.matchedPhotoIds;
            photos = photos.filter(p => matchedIds.includes(p.id));
        }

        if (photos.length === 0) {
            res.status(400).json({ error: 'No photos available for download' });
            return;
        }

        logEntry.photoCount = photos.length;

        // SOFT SIZE GUARD: Estimate total size and reject if too large
        const estimatedSize = photos.reduce((sum, p) => sum + (p.fileSize || 5 * 1024 * 1024), 0);
        logEntry.estimatedSizeBytes = estimatedSize;

        if (estimatedSize > BULK_DOWNLOAD_MAX_SIZE_BYTES) {
            aborted = true;
            abortReason = 'size_limit';
            finalize();
            res.status(400).json({
                error: {
                    message: 'Download size exceeds maximum allowed (5 GB). Please download in smaller batches.',
                    code: 'SIZE_LIMIT_EXCEEDED'
                }
            });
            return;
        }

        // Sanitize gallery name for filename
        const safeGalleryName = gallery.name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'gallery';

        // Set headers for ZIP download
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${safeGalleryName}.zip"`);

        // Create ZIP archive with compression
        archive = archiver.default('zip', { zlib: { level: 5 } });

        // HARD TIMEOUT: Abort after 10 minutes
        timeoutHandle = setTimeout(() => {
            if (!aborted && !res.writableEnded) {
                aborted = true;
                abortReason = 'timeout';
                console.warn(`[BULK_DOWNLOAD_TIMEOUT] gallery=${galleryId} - aborting after ${BULK_DOWNLOAD_TIMEOUT_MS}ms`);
                archive?.abort();
                if (!res.headersSent) {
                    res.status(504).json({ error: { message: 'Download timed out', code: 'TIMEOUT' } });
                }
            }
        }, BULK_DOWNLOAD_TIMEOUT_MS);

        // ABORT ON CLIENT DISCONNECT
        req.on('close', () => {
            if (!res.writableEnded && !aborted) {
                aborted = true;
                abortReason = 'client_disconnect';
                archive?.abort();
            }
        });

        // Handle archive errors
        archive.on('error', (err: Error) => {
            console.error('[BULK_DOWNLOAD_ERROR] Archive error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to create ZIP archive' });
            }
        });

        // Track bytes written
        archive.on('end', () => {
            logEntry.actualBytesWritten = archive?.pointer() || 0;
        });

        // Pipe archive to response
        archive.pipe(res);

        // SEQUENTIAL STREAMING: Process one photo at a time with backpressure
        const storageService = getStorageService();
        for (let i = 0; i < photos.length; i++) {
            // Check abort before each file
            if (aborted) break;

            const photo = photos[i];
            const key = gallery.downloadResolution === 'original' ? photo.originalKey : photo.webKey;

            try {
                const stream = await storageService.getStream(key);
                const ext = photo.filename.split('.').pop() || 'jpg';
                const cleanName = photo.filename.replace(/[^a-zA-Z0-9-_ .]/g, '').trim();
                const archiveName = cleanName || `photo_${i + 1}.${ext}`;

                // Append and WAIT for stream to complete (backpressure-aware)
                await new Promise<void>((resolve, reject) => {
                    stream.on('error', reject);
                    stream.on('end', resolve);
                    archive!.append(stream, { name: archiveName });
                });
            } catch (err) {
                console.error(`[BULK_DOWNLOAD_ERROR] Failed to add ${photo.filename}:`, err);
                // Continue with other photos
            }
        }

        // Finalize the archive
        if (!aborted) {
            await archive.finalize();
        }

        finalize();
    } catch (error) {
        finalize();
        next(error);
    }
});

/**
 * POST /api/photos/gallery/:galleryId/download-favorites
 * Download selected favorite photos as a streaming ZIP file
 * 
 * SAFETY HARDENING v1.1:
 * - Sequential file streaming (one photo at a time, backpressure-aware)
 * - Hard server-side timeout (10 minutes)
 * - Abort on client disconnect
 * - Soft size guard (5 GB pre-flight check)
 * - Structured observability logging
 * 
 * PERMISSION:
 * - bulkFavorites.enabled must be true
 * - User's role must match bulkFavorites.allowedFor
 * - Maximum 200 photos per request
 */
router.post('/gallery/:galleryId/download-favorites', requireAnyAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const archiver = await import('archiver');
    const startTime = Date.now();
    let aborted = false;
    let abortReason: 'client_disconnect' | 'timeout' | 'size_limit' | undefined;
    let timeoutHandle: NodeJS.Timeout | undefined;
    let archive: ReturnType<typeof archiver.default> | undefined;

    // Prepare structured log entry
    const logEntry: BulkDownloadLog = {
        galleryId: '',
        photoCount: 0,
        estimatedSizeBytes: 0,
        actualBytesWritten: 0,
        durationMs: 0,
        aborted: false,
    };

    // Helper to emit structured log and cleanup
    const finalize = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        logEntry.durationMs = Date.now() - startTime;
        logEntry.aborted = aborted;
        if (abortReason) logEntry.abortedReason = abortReason;
        console.log(`[BULK_DOWNLOAD_LOG] favorites ${JSON.stringify(logEntry)}`);
    };

    try {
        const { galleryId } = req.params;
        const { photoIds } = req.body as { photoIds?: string[] };
        logEntry.galleryId = galleryId;

        // Validate request body
        if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
            throw badRequest('photoIds must be a non-empty array of photo IDs');
        }

        // Enforce max count (200)
        if (photoIds.length > MAX_FAVORITES_DOWNLOAD) {
            throw forbidden({
                message: `Cannot download more than ${MAX_FAVORITES_DOWNLOAD} photos at once`,
                code: DOWNLOAD_ERROR_CODES.FAVORITES_LIMIT_EXCEEDED
            } as any);
        }

        const gallery = await prisma.gallery.findUnique({
            where: { id: galleryId },
            select: {
                id: true,
                name: true,
                photographerId: true,
                downloads: true,
                downloadResolution: true,
            },
        });

        if (!gallery) {
            throw notFound('Gallery not found');
        }

        const downloads = getEffectiveDownloads(gallery.downloads as Partial<DownloadSettings>);

        // Check access based on role
        if (req.userRole === 'photographer') {
            if (gallery.photographerId !== req.photographer!.id) {
                throw forbidden('You do not own this gallery');
            }
        } else if (req.userRole === 'primary_client') {
            if (!checkDownloadAllowed(downloads, 'bulkFavorites', 'primary_client')) {
                throw forbidden({
                    message: 'Favorites download is not enabled for this gallery',
                    code: DOWNLOAD_ERROR_CODES.BULK_DOWNLOAD_NOT_ALLOWED
                } as any);
            }
            if (req.primaryClient!.galleryId !== galleryId) {
                throw forbidden('You do not have access to this gallery');
            }
        } else if (req.userRole === 'guest') {
            if (!checkDownloadAllowed(downloads, 'bulkFavorites', 'guest')) {
                throw forbidden({
                    message: 'Favorites download is not enabled for guests',
                    code: DOWNLOAD_ERROR_CODES.BULK_DOWNLOAD_NOT_ALLOWED
                } as any);
            }
            if (req.guest!.galleryId !== galleryId) {
                throw forbidden('You do not have access to this gallery');
            }
        }

        // Get requested photos with file sizes for pre-flight check
        let photos = await prisma.photo.findMany({
            where: {
                galleryId,
                id: { in: photoIds }
            },
            select: {
                id: true,
                filename: true,
                originalKey: true,
                webKey: true,
                fileSize: true, // For size estimation
            },
            orderBy: [
                { sortOrder: 'asc' },
                { createdAt: 'asc' },
            ],
        });

        // PERMISSION: Guests can only download their matched photos
        if (req.userRole === 'guest') {
            const matchedIds = req.guest!.matchedPhotoIds;
            photos = photos.filter(p => matchedIds.includes(p.id));
        }

        if (photos.length === 0) {
            res.status(400).json({ error: 'No photos available for download' });
            return;
        }

        logEntry.photoCount = photos.length;

        // SOFT SIZE GUARD: Estimate total size and reject if too large
        const estimatedSize = photos.reduce((sum, p) => sum + (p.fileSize || 5 * 1024 * 1024), 0);
        logEntry.estimatedSizeBytes = estimatedSize;

        if (estimatedSize > BULK_DOWNLOAD_MAX_SIZE_BYTES) {
            aborted = true;
            abortReason = 'size_limit';
            finalize();
            res.status(400).json({
                error: {
                    message: 'Download size exceeds maximum allowed (5 GB). Please download in smaller batches.',
                    code: 'SIZE_LIMIT_EXCEEDED'
                }
            });
            return;
        }

        // Sanitize gallery name for filename
        const safeGalleryName = gallery.name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'favorites';

        // Set headers for ZIP download
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${safeGalleryName}-favorites.zip"`);

        // Create ZIP archive with compression
        archive = archiver.default('zip', { zlib: { level: 5 } });

        // HARD TIMEOUT: Abort after 10 minutes
        timeoutHandle = setTimeout(() => {
            if (!aborted && !res.writableEnded) {
                aborted = true;
                abortReason = 'timeout';
                console.warn(`[BULK_DOWNLOAD_TIMEOUT] favorites gallery=${galleryId} - aborting after ${BULK_DOWNLOAD_TIMEOUT_MS}ms`);
                archive?.abort();
                if (!res.headersSent) {
                    res.status(504).json({ error: { message: 'Download timed out', code: 'TIMEOUT' } });
                }
            }
        }, BULK_DOWNLOAD_TIMEOUT_MS);

        // ABORT ON CLIENT DISCONNECT
        req.on('close', () => {
            if (!res.writableEnded && !aborted) {
                aborted = true;
                abortReason = 'client_disconnect';
                archive?.abort();
            }
        });

        // Handle archive errors
        archive.on('error', (err: Error) => {
            console.error('[BULK_DOWNLOAD_ERROR] Archive error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to create ZIP archive' });
            }
        });

        // Track bytes written
        archive.on('end', () => {
            logEntry.actualBytesWritten = archive?.pointer() || 0;
        });

        // Pipe archive to response
        archive.pipe(res);

        // SEQUENTIAL STREAMING: Process one photo at a time with backpressure
        const storageService = getStorageService();
        for (let i = 0; i < photos.length; i++) {
            // Check abort before each file
            if (aborted) break;

            const photo = photos[i];
            const key = gallery.downloadResolution === 'original' ? photo.originalKey : photo.webKey;

            try {
                const stream = await storageService.getStream(key);
                const ext = photo.filename.split('.').pop() || 'jpg';
                const cleanName = photo.filename.replace(/[^a-zA-Z0-9-_ .]/g, '').trim();
                const archiveName = cleanName || `photo_${i + 1}.${ext}`;

                // Append and WAIT for stream to complete (backpressure-aware)
                await new Promise<void>((resolve, reject) => {
                    stream.on('error', reject);
                    stream.on('end', resolve);
                    archive!.append(stream, { name: archiveName });
                });
            } catch (err) {
                console.error(`[BULK_DOWNLOAD_ERROR] Failed to add ${photo.filename}:`, err);
                // Continue with other photos
            }
        }

        // Finalize the archive
        if (!aborted) {
            await archive.finalize();
        }

        finalize();
    } catch (error) {
        finalize();
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
