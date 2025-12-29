/**
 * Selection Routes
 * 
 * Primary clients can select photos when selection is OPEN.
 * Selections track session ID for audit trail.
 * 
 * PERMISSION:
 * - Only primary clients can select
 * - Selection must be OPEN (not DISABLED or LOCKED)
 * - Guests cannot select
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { requirePrimaryClient, AuthenticatedRequest, isSelectionAllowed } from '../middleware/auth.middleware.js';
import { badRequest, notFound, forbidden } from '../middleware/error.middleware.js';

const router = Router();

/**
 * POST /api/selections/:photoId
 * Select a photo
 * Primary client only, selection must be OPEN
 */
router.post('/:photoId', requirePrimaryClient, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { photoId } = req.params;

        // Get photo and verify access
        const photo = await prisma.photo.findUnique({
            where: { id: photoId },
            select: {
                id: true,
                galleryId: true,
            },
        });

        if (!photo) {
            throw notFound('Photo not found');
        }

        // Verify client has access to this gallery
        if (req.primaryClient!.galleryId !== photo.galleryId) {
            throw forbidden('You do not have access to this photo');
        }

        // PERMISSION: Check selection state
        if (!await isSelectionAllowed(photo.galleryId)) {
            throw forbidden('Selection is not currently open for this gallery');
        }

        // Create selection with session tracking
        const selection = await prisma.selection.upsert({
            where: {
                photoId_primaryClientId: {
                    photoId,
                    primaryClientId: req.primaryClient!.id,
                },
            },
            create: {
                photoId,
                primaryClientId: req.primaryClient!.id,
                addedBySessionId: req.primaryClient!.sessionToken,
            },
            update: {
                updatedAt: new Date(),
                addedBySessionId: req.primaryClient!.sessionToken,
            },
        });

        res.json({
            selection,
            message: 'Photo selected',
        });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/selections/:photoId
 * Unselect a photo
 * Primary client only, selection must be OPEN
 */
router.delete('/:photoId', requirePrimaryClient, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { photoId } = req.params;

        // Get photo and verify access
        const photo = await prisma.photo.findUnique({
            where: { id: photoId },
            select: {
                id: true,
                galleryId: true,
            },
        });

        if (!photo) {
            throw notFound('Photo not found');
        }

        // Verify client has access to this gallery
        if (req.primaryClient!.galleryId !== photo.galleryId) {
            throw forbidden('You do not have access to this photo');
        }

        // PERMISSION: Check selection state
        if (!await isSelectionAllowed(photo.galleryId)) {
            throw forbidden('Selection is not currently open for this gallery');
        }

        // Delete selection
        await prisma.selection.deleteMany({
            where: {
                photoId,
                primaryClientId: req.primaryClient!.id,
            },
        });

        res.json({
            message: 'Photo unselected',
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/selections/my
 * Get all selections for the current primary client
 */
router.get('/my', requirePrimaryClient, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const selections = await prisma.selection.findMany({
            where: {
                primaryClientId: req.primaryClient!.id,
            },
            select: {
                id: true,
                photoId: true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: { createdAt: 'asc' },
        });

        res.json({
            selections,
            count: selections.length,
        });
    } catch (error) {
        next(error);
    }
});

export default router;
