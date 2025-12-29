/**
 * Section Routes
 * 
 * CRUD for gallery sections (e.g., Day 1, Day 2).
 * Photographer only.
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { requirePhotographer, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { badRequest, notFound, forbidden } from '../middleware/error.middleware.js';

const router = Router();

// Validation schemas
const createSectionSchema = z.object({
    galleryId: z.string().uuid(),
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    sortOrder: z.number().int().min(0).optional(),
});

const updateSectionSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    sortOrder: z.number().int().min(0).optional(),
});

/**
 * POST /api/sections
 * Create a new section
 */
router.post('/', requirePhotographer, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const data = createSectionSchema.parse(req.body);

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

        // Get max sort order if not provided
        let sortOrder = data.sortOrder;
        if (sortOrder === undefined) {
            const maxSection = await prisma.section.findFirst({
                where: { galleryId: data.galleryId },
                orderBy: { sortOrder: 'desc' },
                select: { sortOrder: true },
            });
            sortOrder = (maxSection?.sortOrder ?? -1) + 1;
        }

        const section = await prisma.section.create({
            data: {
                name: data.name,
                description: data.description,
                sortOrder,
                galleryId: data.galleryId,
            },
        });

        res.status(201).json({ section });
    } catch (error) {
        if (error instanceof z.ZodError) {
            next(badRequest(error.errors[0].message));
        } else {
            next(error);
        }
    }
});

/**
 * PATCH /api/sections/:id
 * Update a section
 */
router.patch('/:id', requirePhotographer, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const data = updateSectionSchema.parse(req.body);

        const section = await prisma.section.findUnique({
            where: { id },
            include: {
                gallery: {
                    select: { photographerId: true },
                },
            },
        });

        if (!section) {
            throw notFound('Section not found');
        }

        if (section.gallery.photographerId !== req.photographer!.id) {
            throw forbidden('You do not own this section');
        }

        const updated = await prisma.section.update({
            where: { id },
            data: {
                name: data.name,
                description: data.description,
                sortOrder: data.sortOrder,
            },
        });

        res.json({ section: updated });
    } catch (error) {
        if (error instanceof z.ZodError) {
            next(badRequest(error.errors[0].message));
        } else {
            next(error);
        }
    }
});

/**
 * DELETE /api/sections/:id
 * Delete a section (photos are unlinked, not deleted)
 */
router.delete('/:id', requirePhotographer, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        const section = await prisma.section.findUnique({
            where: { id },
            include: {
                gallery: {
                    select: { photographerId: true },
                },
            },
        });

        if (!section) {
            throw notFound('Section not found');
        }

        if (section.gallery.photographerId !== req.photographer!.id) {
            throw forbidden('You do not own this section');
        }

        // Delete section (photos will have sectionId set to null due to SetNull)
        await prisma.section.delete({
            where: { id },
        });

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

export default router;
