/**
 * Auth Routes
 * 
 * POST /api/auth/register - Register new photographer
 * POST /api/auth/login - Login photographer
 * GET /api/auth/me - Get current photographer
 */

import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../index.js';
import { requirePhotographer, AuthenticatedRequest, JwtPayload } from '../middleware/auth.middleware.js';
import { badRequest, unauthorized } from '../middleware/error.middleware.js';

const router = Router();

// Validation schemas
const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(1),
    businessName: z.string().optional(),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

// Helper to generate JWT
function generateToken(photographer: { id: string; email: string }): string {
    const payload: JwtPayload = {
        photographerId: photographer.id,
        email: photographer.email,
    };

    return jwt.sign(
        payload,
        process.env.JWT_SECRET || 'dev-secret',
        { expiresIn: '7d' } as jwt.SignOptions
    );
}

/**
 * POST /api/auth/register
 * Register a new photographer account
 */
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = registerSchema.parse(req.body);

        // Check if email already exists
        const existing = await prisma.photographer.findUnique({
            where: { email: data.email },
        });

        if (existing) {
            throw badRequest('Email already registered');
        }

        // Hash password
        const passwordHash = await bcrypt.hash(data.password, 12);

        // Create photographer
        const photographer = await prisma.photographer.create({
            data: {
                email: data.email,
                passwordHash,
                name: data.name,
                businessName: data.businessName,
            },
            select: {
                id: true,
                email: true,
                name: true,
                businessName: true,
                createdAt: true,
            },
        });

        // Generate token
        const token = generateToken(photographer);

        res.status(201).json({
            photographer,
            token,
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
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = loginSchema.parse(req.body);

        // Find photographer
        const photographer = await prisma.photographer.findUnique({
            where: { email: data.email },
        });

        if (!photographer) {
            throw unauthorized('Invalid email or password');
        }

        // Verify password
        const isValid = await bcrypt.compare(data.password, photographer.passwordHash);

        if (!isValid) {
            throw unauthorized('Invalid email or password');
        }

        // Generate token
        const token = generateToken(photographer);

        res.json({
            photographer: {
                id: photographer.id,
                email: photographer.email,
                name: photographer.name,
                businessName: photographer.businessName,
            },
            token,
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
 * GET /api/auth/me
 * Get current authenticated photographer
 */
router.get('/me', requirePhotographer, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const photographer = await prisma.photographer.findUnique({
            where: { id: req.photographer!.id },
            select: {
                id: true,
                email: true,
                name: true,
                businessName: true,
                createdAt: true,
                _count: {
                    select: { galleries: true },
                },
            },
        });

        res.json({ photographer });
    } catch (error) {
        next(error);
    }
});

export default router;
