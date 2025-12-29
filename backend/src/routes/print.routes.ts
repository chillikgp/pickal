/**
 * Print Request Routes
 * 
 * Both primary clients and guests can request prints.
 * Only photographer can approve/reject requests.
 * 
 * PERMISSION:
 * - Guests can only request prints for matched photos
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import {
    requirePhotographer,
    requireAnyAuth,
    requireClientAccess,
    AuthenticatedRequest,
    canGuestAccessPhoto,
} from '../middleware/auth.middleware.js';
import { badRequest, notFound, forbidden } from '../middleware/error.middleware.js';

const router = Router();

const createPrintRequestSchema = z.object({
    quantity: z.number().int().min(1).max(100).optional(),
    size: z.string().max(50).optional(),
    notes: z.string().max(500).optional(),
});

const updatePrintRequestSchema = z.object({
    status: z.enum(['APPROVED', 'REJECTED']),
    responseNote: z.string().max(500).optional(),
});

/**
 * POST /api/print-requests/:photoId
 * Create a print request
 * Primary clients and guests can request
 */
router.post('/:photoId', requireClientAccess, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { photoId } = req.params;
        const data = createPrintRequestSchema.parse(req.body);

        const photo = await prisma.photo.findUnique({
            where: { id: photoId },
            select: { id: true, galleryId: true },
        });

        if (!photo) {
            throw notFound('Photo not found');
        }

        // Verify access
        if (req.userRole === 'primary_client') {
            if (req.primaryClient!.galleryId !== photo.galleryId) {
                throw forbidden('You do not have access to this photo');
            }
        } else if (req.userRole === 'guest') {
            // PERMISSION: Guests can only request prints for matched photos
            if (!canGuestAccessPhoto(req.guest, photoId)) {
                throw forbidden('You can only request prints for photos you appear in');
            }
        }

        const printRequest = await prisma.printRequest.create({
            data: {
                quantity: data.quantity ?? 1,
                size: data.size,
                notes: data.notes,
                photoId,
                primaryClientId: req.userRole === 'primary_client' ? req.primaryClient!.id : undefined,
                guestId: req.userRole === 'guest' ? req.guest!.id : undefined,
            },
        });

        res.status(201).json({ printRequest });
    } catch (error) {
        if (error instanceof z.ZodError) {
            next(badRequest(error.errors[0].message));
        } else {
            next(error);
        }
    }
});

/**
 * GET /api/print-requests/gallery/:galleryId
 * Get all print requests for a gallery
 * Photographer only
 */
router.get('/gallery/:galleryId', requirePhotographer, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { galleryId } = req.params;

        // Verify gallery ownership
        const gallery = await prisma.gallery.findUnique({
            where: { id: galleryId },
            select: { photographerId: true },
        });

        if (!gallery) {
            throw notFound('Gallery not found');
        }

        if (gallery.photographerId !== req.photographer!.id) {
            throw forbidden('You do not own this gallery');
        }

        const printRequests = await prisma.printRequest.findMany({
            where: {
                photo: {
                    galleryId,
                },
            },
            include: {
                photo: {
                    select: { id: true, filename: true, webKey: true },
                },
                primaryClient: {
                    select: { id: true, name: true, email: true },
                },
                guest: {
                    select: { id: true, mobileNumber: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({ printRequests });
    } catch (error) {
        next(error);
    }
});

/**
 * PATCH /api/print-requests/:id
 * Approve or reject a print request
 * Photographer only
 */
router.patch('/:id', requirePhotographer, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const data = updatePrintRequestSchema.parse(req.body);

        const printRequest = await prisma.printRequest.findUnique({
            where: { id },
            include: {
                photo: {
                    include: {
                        gallery: {
                            select: { photographerId: true },
                        },
                    },
                },
            },
        });

        if (!printRequest) {
            throw notFound('Print request not found');
        }

        if (printRequest.photo.gallery.photographerId !== req.photographer!.id) {
            throw forbidden('You do not own this gallery');
        }

        const updated = await prisma.printRequest.update({
            where: { id },
            data: {
                status: data.status,
                responseNote: data.responseNote,
                respondedAt: new Date(),
            },
        });

        res.json({ printRequest: updated });
    } catch (error) {
        if (error instanceof z.ZodError) {
            next(badRequest(error.errors[0].message));
        } else {
            next(error);
        }
    }
});

/**
 * GET /api/print-requests/my
 * Get print requests for the current client
 */
router.get('/my', requireClientAccess, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const where = req.userRole === 'primary_client'
            ? { primaryClientId: req.primaryClient!.id }
            : { guestId: req.guest!.id };

        const printRequests = await prisma.printRequest.findMany({
            where,
            include: {
                photo: {
                    select: { id: true, filename: true, webKey: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({ printRequests });
    } catch (error) {
        next(error);
    }
});

export default router;
