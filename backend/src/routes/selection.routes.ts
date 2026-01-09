/**
 * Selection Routes
 * 
 * Primary clients can select photos when selection is OPEN.
 * Selections are GALLERY-LEVEL (shared state).
 * 
 * PERMISSION:
 * - Only primary clients can select
 * - Selection must be OPEN
 * - Guests cannot select
 */

import { Router, Response, NextFunction } from 'express';
import { prisma } from '../index.js';
import { requirePrimaryClient, AuthenticatedRequest, isSelectionAllowed } from '../middleware/auth.middleware.js';
import { notFound, forbidden, badRequest } from '../middleware/error.middleware.js';

const router = Router();

/**
 * POST /api/selections/:photoId
 * Toggle selection (Add/Remove)
 * Shared gallery-level state
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

        const { selected } = req.body;

        if (typeof selected !== 'boolean') {
            throw badRequest('Missing required field: selected (boolean)');
        }

        if (selected) {
            // Add selection (Idempotent)
            try {
                await prisma.selection.create({
                    data: { photoId },
                });
            } catch (error: any) {
                // Ignore unique constraint violation (already selected)
                if (error.code !== 'P2002') throw error;
            }
            res.json({ selected: true, message: 'Selection added' });
        } else {
            // Remove selection (Idempotent)
            try {
                await prisma.selection.delete({
                    where: { photoId },
                });
            } catch (error: any) {
                // Ignore record not found (already unselected)
                if (error.code !== 'P2025') throw error;
            }
            res.json({ selected: false, message: 'Selection removed' });
        }

    } catch (error) {
        next(error);
    }
});

export default router;
