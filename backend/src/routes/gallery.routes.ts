/**
 * Gallery Routes
 * 
 * CRUD operations for galleries.
 * Access control:
 * - Create/Update/Delete: Photographer only
 * - Read: Photographer or authenticated client
 * - Access via private key: Creates primary client session
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import {
    requirePhotographer,
    requireAnyAuth,
    AuthenticatedRequest
} from '../middleware/auth.middleware.js';
import { badRequest, notFound, forbidden } from '../middleware/error.middleware.js';
import { getFaceRecognitionService, getStorageService } from '../services/index.js';

const router = Router();

// Validation schemas
// P0-1: Slug validation - lowercase, numbers, hyphens only, no spaces
const slugRegex = /^[a-z0-9-]+$/;

const createGallerySchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    eventDate: z.string().datetime().optional(),
    // P0-1: Custom slug for short URL
    customSlug: z.string()
        .min(2, 'Slug must be at least 2 characters')
        .max(50, 'Slug must be at most 50 characters')
        .regex(slugRegex, 'Slug must be lowercase letters, numbers, and hyphens only')
        .optional(),
    // P0-1: Short password (4-6 characters for easy verbal sharing)
    customPassword: z.string()
        .min(4, 'Password must be at least 4 characters')
        .max(6, 'Password must be at most 6 characters')
        .optional(),
    // P0-2: Internal notes for photographer only
    internalNotes: z.string().max(2000).optional(),
});

const updateGallerySchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    eventDate: z.string().datetime().optional(),
    downloadsEnabled: z.boolean().optional(),
    downloadResolution: z.enum(['web', 'original']).optional(),
    selectionState: z.enum(['DISABLED', 'OPEN', 'LOCKED']).optional(),
    commentsEnabled: z.boolean().optional(),
    selfieMatchingEnabled: z.boolean().optional(),
    coverPhotoId: z.string().uuid().nullable().optional(),
    // P0-1: Custom slug for short URL
    customSlug: z.string()
        .min(2, 'Slug must be at least 2 characters')
        .max(50, 'Slug must be at most 50 characters')
        .regex(slugRegex, 'Slug must be lowercase letters, numbers, and hyphens only')
        .nullable()
        .optional(),
    // P0-1: Short password (4-6 characters for easy verbal sharing)
    customPassword: z.string()
        .min(4, 'Password must be at least 4 characters')
        .max(6, 'Password must be at most 6 characters')
        .nullable()
        .optional(),
    // P0-2: Internal notes for photographer only
    internalNotes: z.string().max(2000).nullable().optional(),
});

// P0-1: Access schema supports both UUID privateKey and short password
const accessGallerySchema = z.object({
    privateKey: z.string().min(1), // Accept any string (UUID or short password)
    clientName: z.string().optional(),
    clientEmail: z.string().email().optional(),
});
// ============================================================================
// PUBLIC ENDPOINTS (No authentication required)
// ============================================================================

/**
 * GET /api/galleries/:id/public-config
 * Public endpoint to get gallery feature flags and branding for access page.
 * Returns only safe, non-sensitive configuration.
 * 
 * This endpoint is INTENTIONALLY unauthenticated.
 */
router.get('/:id/public-config', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        const gallery = await prisma.gallery.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                eventDate: true,
                selfieMatchingEnabled: true,
                downloadsEnabled: true,
                accessModes: true,
                coverPhotoId: true,
                photographer: {
                    select: {
                        name: true,
                        businessName: true,
                        logoUrl: true,
                        websiteUrl: true,
                        reviewUrl: true,
                        whatsappNumber: true,
                    },
                },
            },
        });

        if (!gallery) {
            throw notFound('Gallery not found');
        }

        // Get cover photo URL if exists
        let coverPhotoUrl: string | null = null;
        if (gallery.coverPhotoId) {
            const coverPhoto = await prisma.photo.findUnique({
                where: { id: gallery.coverPhotoId },
                select: { webKey: true },
            });
            if (coverPhoto) {
                const storageService = getStorageService();
                coverPhotoUrl = await storageService.getSignedUrl(coverPhoto.webKey, 3600);
            }
        }

        console.log(`[PUBLIC] Config request for gallery ${id}: selfieMatchingEnabled=${gallery.selfieMatchingEnabled}`);

        res.json({
            galleryId: gallery.id,
            galleryName: gallery.name,
            eventDate: gallery.eventDate,
            coverPhotoUrl,
            selfieMatchingEnabled: gallery.selfieMatchingEnabled,
            downloadsEnabled: gallery.downloadsEnabled,
            accessModes: gallery.accessModes,
            studio: {
                name: gallery.photographer.businessName || gallery.photographer.name,
                logoUrl: gallery.photographer.logoUrl,
                websiteUrl: gallery.photographer.websiteUrl,
                reviewUrl: gallery.photographer.reviewUrl,
                whatsappNumber: gallery.photographer.whatsappNumber,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/galleries/by-slug/:slug
 * P0-1: Look up a gallery by its custom slug
 * Returns only the gallery ID for redirection, no sensitive data
 * 
 * This endpoint is INTENTIONALLY unauthenticated.
 */
router.get('/by-slug/:slug', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { slug } = req.params;

        // Find gallery by slug (slug is unique per photographer, but we return the first match)
        const gallery = await prisma.gallery.findFirst({
            where: { customSlug: slug },
            select: {
                id: true,
                name: true,
                customSlug: true,
            },
        });

        if (!gallery) {
            throw notFound('Gallery not found');
        }

        console.log(`[PUBLIC] Slug lookup: ${slug} -> gallery ${gallery.id}`);

        res.json({
            galleryId: gallery.id,
            name: gallery.name,
        });
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// AUTHENTICATED ENDPOINTS
// ============================================================================

/**
 * GET /api/galleries
 * List all galleries for the authenticated photographer
 */
router.get('/', requirePhotographer, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const galleries = await prisma.gallery.findMany({
            where: { photographerId: req.photographer!.id },
            select: {
                id: true,
                name: true,
                description: true,
                eventDate: true,
                privateKey: true,
                downloadsEnabled: true,
                selectionState: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        photos: true,
                        sections: true,
                        primaryClients: true,
                        guests: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({ galleries });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/galleries
 * Create a new gallery
 */
router.post('/', requirePhotographer, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const data = createGallerySchema.parse(req.body);

        // P0-1: Validate slug uniqueness for this photographer if provided
        if (data.customSlug) {
            const existingSlug = await prisma.gallery.findFirst({
                where: {
                    photographerId: req.photographer!.id,
                    customSlug: data.customSlug,
                },
            });
            if (existingSlug) {
                throw badRequest('This slug is already in use. Please choose a different one.');
            }
        }

        const gallery = await prisma.gallery.create({
            data: {
                name: data.name,
                description: data.description,
                eventDate: data.eventDate ? new Date(data.eventDate) : undefined,
                photographerId: req.photographer!.id,
                // P0-1: Short URL slug and password
                customSlug: data.customSlug,
                customPassword: data.customPassword,
                // P0-2: Internal notes
                internalNotes: data.internalNotes,
            },
            select: {
                id: true,
                name: true,
                description: true,
                eventDate: true,
                privateKey: true,
                accessModes: true,
                downloadsEnabled: true,
                downloadResolution: true,
                selectionState: true,
                commentsEnabled: true,
                selfieMatchingEnabled: true,
                customSlug: true,
                customPassword: true,
                internalNotes: true,
                createdAt: true,
            },
        });

        res.status(201).json({ gallery });
    } catch (error) {
        if (error instanceof z.ZodError) {
            next(badRequest(error.errors[0].message));
        } else {
            next(error);
        }
    }
});

/**
 * GET /api/galleries/:id
 * Get gallery details
 * - Photographer: Full details including private key
 * - Client: Limited details
 */
router.get('/:id', requireAnyAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        const gallery = await prisma.gallery.findUnique({
            where: { id },
            include: {
                sections: {
                    orderBy: { sortOrder: 'asc' },
                    include: {
                        _count: {
                            select: { photos: true },
                        },
                    },
                },
                photographer: {
                    select: {
                        id: true,
                        name: true,
                        businessName: true,
                        logoUrl: true,
                        websiteUrl: true,
                        reviewUrl: true,
                        whatsappNumber: true,
                    },
                },
                _count: {
                    select: {
                        photos: true,
                        primaryClients: true,
                        guests: true,
                    },
                },
            },
        });

        if (!gallery) {
            throw notFound('Gallery not found');
        }

        // Fetch cover photo if set
        let coverPhoto: any = null;
        if (gallery.coverPhotoId) {
            const rawCoverPhoto = await prisma.photo.findUnique({
                where: { id: gallery.coverPhotoId },
                select: {
                    id: true,
                    filename: true,
                    webKey: true,
                    lqipBase64: true,
                    width: true,
                    height: true,
                },
            });

            if (rawCoverPhoto) {
                const storageService = getStorageService();
                coverPhoto = {
                    ...rawCoverPhoto,
                    webUrl: await storageService.getSignedUrl(rawCoverPhoto.webKey),
                };
            }
        }

        // Check access
        if (req.userRole === 'photographer') {
            // Photographer must own the gallery
            if (gallery.photographerId !== req.photographer!.id) {
                throw forbidden('You do not own this gallery');
            }
        } else if (req.userRole === 'primary_client') {
            // Primary client must belong to this gallery
            if (req.primaryClient!.galleryId !== id) {
                throw forbidden('You do not have access to this gallery');
            }
        } else if (req.userRole === 'guest') {
            // Guest must belong to this gallery
            if (req.guest!.galleryId !== id) {
                throw forbidden('You do not have access to this gallery');
            }
        }

        // P0-2: Remove internal notes and sensitive fields for non-photographer users
        const response = {
            ...gallery,
            coverPhoto,
            // P0-1: Allow authorized users (EXCEPT guests) to see access credentials for sharing
            privateKey: req.userRole !== 'guest' ? gallery.privateKey : undefined,
            customPassword: req.userRole !== 'guest' ? gallery.customPassword : undefined,
            internalNotes: req.userRole === 'photographer' ? gallery.internalNotes : undefined,
        };

        res.json({ gallery: response });
    } catch (error) {
        next(error);
    }
});

/**
 * PATCH /api/galleries/:id
 * Update gallery settings
 * Photographer only
 */
router.patch('/:id', requirePhotographer, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const data = updateGallerySchema.parse(req.body);

        // Verify ownership
        const existing = await prisma.gallery.findUnique({
            where: { id },
            select: { photographerId: true, customSlug: true },
        });

        if (!existing) {
            throw notFound('Gallery not found');
        }

        if (existing.photographerId !== req.photographer!.id) {
            throw forbidden('You do not own this gallery');
        }

        // P0-1: Validate slug uniqueness if changing to a new value
        if (data.customSlug && data.customSlug !== existing.customSlug) {
            const duplicateSlug = await prisma.gallery.findFirst({
                where: {
                    photographerId: req.photographer!.id,
                    customSlug: data.customSlug,
                    id: { not: id }, // Exclude current gallery
                },
            });
            if (duplicateSlug) {
                throw badRequest('This slug is already in use. Please choose a different one.');
            }
        }

        const gallery = await prisma.gallery.update({
            where: { id },
            data: {
                name: data.name,
                description: data.description,
                eventDate: data.eventDate ? new Date(data.eventDate) : undefined,
                downloadsEnabled: data.downloadsEnabled,
                downloadResolution: data.downloadResolution,
                selectionState: data.selectionState,
                commentsEnabled: data.commentsEnabled,
                selfieMatchingEnabled: data.selfieMatchingEnabled,
                coverPhotoId: data.coverPhotoId,
                // P0-1: Custom slug and password
                customSlug: data.customSlug,
                customPassword: data.customPassword,
                // P0-2: Internal notes
                internalNotes: data.internalNotes,
            },
        });

        res.json({ gallery });
    } catch (error) {
        if (error instanceof z.ZodError) {
            next(badRequest(error.errors[0].message));
        } else {
            next(error);
        }
    }
});

/**
 * DELETE /api/galleries/:id
 * Delete a gallery and all associated data
 * Photographer only
 */
router.delete('/:id', requirePhotographer, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        // Verify ownership
        const existing = await prisma.gallery.findUnique({
            where: { id },
            select: { photographerId: true },
        });

        if (!existing) {
            throw notFound('Gallery not found');
        }

        if (existing.photographerId !== req.photographer!.id) {
            throw forbidden('You do not own this gallery');
        }

        // Delete face data for this gallery
        const faceService = getFaceRecognitionService();
        await faceService.deleteGalleryFaces(id);

        // Delete gallery (cascades to photos, sections, etc.)
        await prisma.gallery.delete({
            where: { id },
        });

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/galleries/:id/access
 * Access a gallery with private key OR short password (P0-1)
 * Creates a primary client session
 */
router.post('/:id/access', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const data = accessGallerySchema.parse(req.body);

        // Find gallery by id and check access credentials
        const gallery = await prisma.gallery.findUnique({
            where: { id },
            select: {
                id: true,
                privateKey: true,
                customPassword: true, // P0-1: Short password support
                name: true,
                accessModes: true,
            },
        });

        if (!gallery) {
            throw notFound('Gallery not found');
        }

        // P0-1: Check if provided key matches either privateKey (UUID) or customPassword (short)
        const isValidAccess =
            gallery.privateKey === data.privateKey ||
            (gallery.customPassword && gallery.customPassword === data.privateKey);

        if (!isValidAccess) {
            throw forbidden('Invalid access key');
        }

        if (!gallery.accessModes.includes('PRIVATE_KEY')) {
            throw forbidden('Private key access is not enabled for this gallery');
        }

        // Create or update primary client session
        const primaryClient = await prisma.primaryClient.create({
            data: {
                name: data.clientName,
                email: data.clientEmail,
                galleryId: id,
            },
            select: {
                id: true,
                sessionToken: true,
                name: true,
                createdAt: true,
            },
        });

        res.json({
            gallery: {
                id: gallery.id,
                name: gallery.name,
            },
            sessionToken: primaryClient.sessionToken,
            clientId: primaryClient.id,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            next(badRequest(error.errors[0].message));
        } else {
            next(error);
        }
    }
});

/**
 * POST /api/galleries/:id/reset-selections
 * Reset all selections for a gallery
 * Photographer only
 */
router.post('/:id/reset-selections', requirePhotographer, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        // Verify ownership
        const existing = await prisma.gallery.findUnique({
            where: { id },
            select: { photographerId: true },
        });

        if (!existing) {
            throw notFound('Gallery not found');
        }

        if (existing.photographerId !== req.photographer!.id) {
            throw forbidden('You do not own this gallery');
        }

        // Delete all selections for photos in this gallery
        await prisma.selection.deleteMany({
            where: {
                photo: {
                    galleryId: id,
                },
            },
        });

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/galleries/:id/selections
 * Get all selections for a gallery with metadata
 * Photographer only - shows who added which selections
 */
router.get('/:id/selections', requirePhotographer, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        // Verify ownership
        const existing = await prisma.gallery.findUnique({
            where: { id },
            select: { photographerId: true },
        });

        if (!existing) {
            throw notFound('Gallery not found');
        }

        if (existing.photographerId !== req.photographer!.id) {
            throw forbidden('You do not own this gallery');
        }

        // Get all selections with metadata
        const selections = await prisma.selection.findMany({
            where: {
                photo: {
                    galleryId: id,
                },
            },
            include: {
                photo: {
                    select: {
                        id: true,
                        filename: true,
                        webKey: true,
                    },
                },
                primaryClient: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        // Calculate summary
        const summary = {
            totalSelections: selections.length,
            lastUpdated: selections.length > 0 ? selections[0].updatedAt : null,
            byClient: selections.reduce((acc, sel) => {
                const clientId = sel.primaryClient.id;
                if (!acc[clientId]) {
                    acc[clientId] = {
                        client: sel.primaryClient,
                        count: 0,
                        lastUpdated: sel.updatedAt,
                    };
                }
                acc[clientId].count++;
                if (sel.updatedAt > acc[clientId].lastUpdated) {
                    acc[clientId].lastUpdated = sel.updatedAt;
                }
                return acc;
            }, {} as Record<string, any>),
        };

        res.json({
            selections,
            summary: {
                ...summary,
                byClient: Object.values(summary.byClient),
            },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
