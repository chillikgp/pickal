import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../index.js';
import { unauthorized, forbidden } from './error.middleware.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface JwtPayload {
    photographerId: string;
    email: string;
}

export interface AuthenticatedRequest extends Request {
    photographer?: {
        id: string;
        email: string;
    };
    primaryClient?: {
        id: string;
        sessionToken: string;
        galleryId: string;
    };
    guest?: {
        id: string;
        sessionToken: string;
        galleryId: string;
        matchedPhotoIds: string[];
    };
    userRole?: 'photographer' | 'primary_client' | 'guest';
}

// ============================================================================
// PHOTOGRAPHER AUTH (JWT-based)
// ============================================================================

/**
 * Verifies JWT token and attaches photographer to request.
 * Use for photographer-only routes.
 */
export async function requirePhotographer(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader?.startsWith('Bearer ')) {
            throw unauthorized('No token provided');
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || 'dev-secret'
        ) as JwtPayload;

        const photographer = await prisma.photographer.findUnique({
            where: { id: decoded.photographerId },
            select: { id: true, email: true },
        });

        if (!photographer) {
            throw unauthorized('Invalid token');
        }

        req.photographer = photographer;
        req.userRole = 'photographer';
        next();
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            next(unauthorized('Invalid token'));
        } else {
            next(error);
        }
    }
}

// ============================================================================
// CLIENT AUTH (Session token based)
// ============================================================================

/**
 * Verifies session token for primary clients or guests.
 * Attaches client info to request.
 */
export async function requireClientAccess(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) {
    try {
        const sessionToken = req.headers['x-session-token'] as string;
        const galleryId = req.params.galleryId || req.body.galleryId;

        if (!sessionToken) {
            throw unauthorized('No session token provided');
        }

        // Try to find primary client first
        const primaryClient = await prisma.primaryClient.findUnique({
            where: { sessionToken },
            select: { id: true, sessionToken: true, galleryId: true },
        });

        if (primaryClient) {
            if (galleryId && primaryClient.galleryId !== galleryId) {
                throw forbidden('Session token not valid for this gallery');
            }
            req.primaryClient = primaryClient;
            req.userRole = 'primary_client';
            next();
            return;
        }

        // Try to find guest
        const guest = await prisma.guest.findUnique({
            where: { sessionToken },
            select: { id: true, sessionToken: true, galleryId: true, matchedPhotoIds: true },
        });

        if (guest) {
            if (galleryId && guest.galleryId !== galleryId) {
                throw forbidden('Session token not valid for this gallery');
            }
            req.guest = guest;
            req.userRole = 'guest';
            next();
            return;
        }

        throw unauthorized('Invalid session token');
    } catch (error) {
        next(error);
    }
}

// ============================================================================
// ROLE-BASED ACCESS CONTROL
// ============================================================================

/**
 * Requires primary client access (not guest).
 * Use for selection and comment routes.
 */
export async function requirePrimaryClient(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) {
    await requireClientAccess(req, res, (error) => {
        if (error) {
            next(error);
            return;
        }

        if (req.userRole !== 'primary_client') {
            next(forbidden('Only primary clients can perform this action'));
            return;
        }

        next();
    });
}

/**
 * Allows either photographer OR client access.
 * Photographer has full access, clients have role-based access.
 */
export async function requireAnyAuth(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) {
    // Check for JWT first (photographer)
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
        return requirePhotographer(req, res, next);
    }

    // Fall back to session token (client)
    const sessionToken = req.headers['x-session-token'];

    if (sessionToken) {
        return requireClientAccess(req, res, next);
    }

    next(unauthorized('Authentication required'));
}

// ============================================================================
// PERMISSION HELPERS
// ============================================================================

/**
 * PERMISSION: Guest downloads are strictly limited to:
 * 1. Photos that match their face (in matchedPhotoIds)
 * 2. Downloads must be enabled by photographer
 */
export function canGuestAccessPhoto(
    guest: AuthenticatedRequest['guest'],
    photoId: string
): boolean {
    if (!guest) return false;
    return guest.matchedPhotoIds.includes(photoId);
}

/**
 * PERMISSION: Check if gallery downloads are enabled
 */
export async function isDownloadEnabled(galleryId: string): Promise<boolean> {
    const gallery = await prisma.gallery.findUnique({
        where: { id: galleryId },
        select: { downloadsEnabled: true },
    });
    return gallery?.downloadsEnabled ?? false;
}

/**
 * PERMISSION: Check if selection is allowed for gallery
 */
export async function isSelectionAllowed(galleryId: string): Promise<boolean> {
    const gallery = await prisma.gallery.findUnique({
        where: { id: galleryId },
        select: { selectionState: true },
    });
    return gallery?.selectionState === 'OPEN';
}
