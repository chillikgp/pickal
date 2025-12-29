/**
 * Comment Routes
 * 
 * Primary clients can comment on photos.
 * 
 * PERMISSION:
 * - Only primary clients can comment
 * - Comments must be enabled for the gallery
 * - Guests cannot comment
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { requirePrimaryClient, requireAnyAuth, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { badRequest, notFound, forbidden } from '../middleware/error.middleware.js';

const router = Router();

const createCommentSchema = z.object({
    content: z.string().min(1).max(1000),
});

/**
 * POST /api/comments/:photoId
 * Add a comment to a photo
 * Primary client only
 */
router.post('/:photoId', requirePrimaryClient, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { photoId } = req.params;
        const data = createCommentSchema.parse(req.body);

        // Get photo and gallery
        const photo = await prisma.photo.findUnique({
            where: { id: photoId },
            include: {
                gallery: {
                    select: {
                        id: true,
                        commentsEnabled: true,
                    },
                },
            },
        });

        if (!photo) {
            throw notFound('Photo not found');
        }

        // Verify client has access to this gallery
        if (req.primaryClient!.galleryId !== photo.galleryId) {
            throw forbidden('You do not have access to this photo');
        }

        // PERMISSION: Check comments are enabled
        if (!photo.gallery.commentsEnabled) {
            throw forbidden('Comments are not enabled for this gallery');
        }

        const comment = await prisma.comment.create({
            data: {
                content: data.content,
                photoId,
                primaryClientId: req.primaryClient!.id,
            },
            include: {
                primaryClient: {
                    select: { id: true, name: true },
                },
            },
        });

        res.status(201).json({ comment });
    } catch (error) {
        if (error instanceof z.ZodError) {
            next(badRequest(error.errors[0].message));
        } else {
            next(error);
        }
    }
});

/**
 * GET /api/comments/photo/:photoId
 * Get all comments for a photo
 */
router.get('/photo/:photoId', requireAnyAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { photoId } = req.params;

        const photo = await prisma.photo.findUnique({
            where: { id: photoId },
            select: { galleryId: true },
        });

        if (!photo) {
            throw notFound('Photo not found');
        }

        // Verify access based on role
        if (req.userRole === 'primary_client') {
            if (req.primaryClient!.galleryId !== photo.galleryId) {
                throw forbidden('You do not have access to this photo');
            }
        } else if (req.userRole === 'guest') {
            if (req.guest!.galleryId !== photo.galleryId) {
                throw forbidden('You do not have access to this photo');
            }
        }

        const comments = await prisma.comment.findMany({
            where: { photoId },
            include: {
                primaryClient: {
                    select: { id: true, name: true },
                },
            },
            orderBy: { createdAt: 'asc' },
        });

        res.json({ comments });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/comments/:id
 * Delete a comment (only by the author)
 */
router.delete('/:id', requirePrimaryClient, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        const comment = await prisma.comment.findUnique({
            where: { id },
            select: { primaryClientId: true },
        });

        if (!comment) {
            throw notFound('Comment not found');
        }

        if (comment.primaryClientId !== req.primaryClient!.id) {
            throw forbidden('You can only delete your own comments');
        }

        await prisma.comment.delete({
            where: { id },
        });

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

export default router;
