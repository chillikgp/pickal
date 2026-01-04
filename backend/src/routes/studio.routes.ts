/**
 * Studio Routes
 * 
 * Handles studio-level routing and resolution for:
 * - Path-based studio slugs (e.g., /mybabypictures/g/baby-ivaan)
 * - Custom domains (e.g., gallery.mybabypictures.in)
 * - Legacy UUID fallback
 * 
 * Priority order: customDomain > studioSlug > UUID
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { notFound, badRequest } from '../middleware/error.middleware.js';
import { getStorageService } from '../services/index.js';

const router = Router();

// Validation schema for resolve endpoint
const resolveSchema = z.object({
    host: z.string().optional(),           // Custom domain from Host header
    studioSlug: z.string().optional(),     // Path-based studio slug
    gallerySlug: z.string().optional(),    // Gallery slug within studio
    uuid: z.string().uuid().optional(),    // Legacy gallery UUID
});

/**
 * GET /api/studios/resolve
 * Unified resolver for studio + gallery lookup
 * 
 * Query params:
 *   - host: Custom domain (optional)
 *   - studioSlug: Path-based studio slug (optional)
 *   - gallerySlug: Gallery slug within studio (optional)
 *   - uuid: Legacy gallery UUID (optional)
 * 
 * Priority: customDomain > studioSlug > uuid
 * 
 * Returns: { gallery, photographer, resolvedVia }
 */
router.get('/resolve', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const query = resolveSchema.parse(req.query);
        const { host, studioSlug, gallerySlug, uuid } = query;

        let gallery = null;
        let photographer = null;
        let resolvedVia: 'customDomain' | 'studioSlug' | 'uuid' | null = null;

        // Priority 1: Custom domain resolution
        if (host && !host.includes('vercel.app') && !host.includes('localhost')) {
            // Normalize host (remove port if present)
            const normalizedHost = host.split(':')[0].toLowerCase();

            photographer = await prisma.photographer.findUnique({
                where: { customDomain: normalizedHost },
                select: {
                    id: true,
                    name: true,
                    businessName: true,
                    studioSlug: true,
                    customDomain: true,
                    logoUrl: true,
                    websiteUrl: true,
                    reviewUrl: true,
                    whatsappNumber: true,
                },
            });

            if (photographer && gallerySlug) {
                // Find gallery by slug within this photographer's galleries
                gallery = await prisma.gallery.findFirst({
                    where: {
                        photographerId: photographer.id,
                        customSlug: gallerySlug,
                    },
                    select: {
                        id: true,
                        name: true,
                        customSlug: true,
                        eventDate: true,
                        coverPhotoId: true,
                    },
                });

                if (gallery) {
                    resolvedVia = 'customDomain';
                }
            }
        }

        // Priority 2: Studio slug + gallery slug resolution
        if (!gallery && studioSlug && gallerySlug) {
            photographer = await prisma.photographer.findUnique({
                where: { studioSlug: studioSlug.toLowerCase() },
                select: {
                    id: true,
                    name: true,
                    businessName: true,
                    studioSlug: true,
                    customDomain: true,
                    logoUrl: true,
                    websiteUrl: true,
                    reviewUrl: true,
                    whatsappNumber: true,
                },
            });

            if (photographer) {
                gallery = await prisma.gallery.findFirst({
                    where: {
                        photographerId: photographer.id,
                        customSlug: gallerySlug.toLowerCase(),
                    },
                    select: {
                        id: true,
                        name: true,
                        customSlug: true,
                        eventDate: true,
                        coverPhotoId: true,
                    },
                });

                if (gallery) {
                    resolvedVia = 'studioSlug';
                }
            }
        }

        // Priority 3: Legacy UUID fallback
        if (!gallery && uuid) {
            gallery = await prisma.gallery.findUnique({
                where: { id: uuid },
                select: {
                    id: true,
                    name: true,
                    customSlug: true,
                    eventDate: true,
                    coverPhotoId: true,
                    photographer: {
                        select: {
                            id: true,
                            name: true,
                            businessName: true,
                            studioSlug: true,
                            customDomain: true,
                            logoUrl: true,
                            websiteUrl: true,
                            reviewUrl: true,
                            whatsappNumber: true,
                        },
                    },
                },
            });

            if (gallery) {
                photographer = gallery.photographer;
                resolvedVia = 'uuid';
            }
        }

        if (!gallery) {
            throw notFound('Gallery not found');
        }

        // Get cover photo URL if exists
        let coverPhotoUrl = null;
        if (gallery.coverPhotoId) {
            const coverPhoto = await prisma.photo.findUnique({
                where: { id: gallery.coverPhotoId },
                select: { webKey: true },
            });
            if (coverPhoto) {
                const storageService = getStorageService();
                coverPhotoUrl = await storageService.getSignedUrl(coverPhoto.webKey);
            }
        }

        // Build canonical URL
        let canonicalUrl: string;
        if (photographer?.customDomain) {
            canonicalUrl = `https://${photographer.customDomain}/g/${gallery.customSlug || gallery.id}`;
        } else if (photographer?.studioSlug) {
            canonicalUrl = `https://pickal-tan.vercel.app/${photographer.studioSlug}/g/${gallery.customSlug || gallery.id}`;
        } else {
            canonicalUrl = `https://pickal-tan.vercel.app/g/${gallery.id}`;
        }

        res.json({
            gallery: {
                ...gallery,
                coverPhotoUrl,
            },
            photographer,
            resolvedVia,
            canonicalUrl,
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
 * GET /api/studios/by-slug/:slug
 * Get studio (photographer) info by slug
 */
router.get('/by-slug/:slug', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { slug } = req.params;

        const photographer = await prisma.photographer.findUnique({
            where: { studioSlug: slug.toLowerCase() },
            select: {
                id: true,
                name: true,
                businessName: true,
                studioSlug: true,
                customDomain: true,
                logoUrl: true,
                websiteUrl: true,
                reviewUrl: true,
                whatsappNumber: true,
                _count: {
                    select: { galleries: true },
                },
            },
        });

        if (!photographer) {
            throw notFound('Studio not found');
        }

        res.json({ studio: photographer });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/studios/by-domain/:domain
 * Get studio (photographer) info by custom domain
 */
router.get('/by-domain/:domain', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { domain } = req.params;

        const photographer = await prisma.photographer.findUnique({
            where: { customDomain: domain.toLowerCase() },
            select: {
                id: true,
                name: true,
                businessName: true,
                studioSlug: true,
                customDomain: true,
                logoUrl: true,
                websiteUrl: true,
                reviewUrl: true,
                whatsappNumber: true,
            },
        });

        if (!photographer) {
            throw notFound('Studio not found for this domain');
        }

        res.json({ studio: photographer });
    } catch (error) {
        next(error);
    }
});

export default router;
