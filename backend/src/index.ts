import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/auth.routes.js';
import galleryRoutes from './routes/gallery.routes.js';
import photoRoutes from './routes/photo.routes.js';
import sectionRoutes from './routes/section.routes.js';
import selectionRoutes from './routes/selection.routes.js';
import commentRoutes from './routes/comment.routes.js';
import printRoutes from './routes/print.routes.js';
import faceRoutes from './routes/face.routes.js';
import studioRoutes from './routes/studio.routes.js';
import { errorHandler } from './middleware/error.middleware.js';

// Initialize Prisma
export const prisma = new PrismaClient();

// Create Express app
const app = express();

// ============================================================================
// CORS Configuration with Dynamic Custom Domain Support
// ============================================================================

// Static allowed origins (always allowed)
const STATIC_ALLOWED_ORIGINS = [
    process.env.FRONTEND_URL || 'https://pickal-tan.vercel.app',
    'https://pickal-tan.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001',
];

// Cache for custom domains (refreshed periodically)
let customDomainsCache: Set<string> = new Set();
let cacheLastUpdated = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Refresh custom domains cache from database
async function refreshCustomDomainsCache(): Promise<void> {
    try {
        const photographers = await prisma.photographer.findMany({
            where: { customDomain: { not: null } },
            select: { customDomain: true },
        });

        customDomainsCache = new Set(
            photographers
                .map(p => p.customDomain)
                .filter((d): d is string => d !== null)
                .map(d => `https://${d.toLowerCase()}`)
        );

        cacheLastUpdated = Date.now();
        console.log(`[CORS] Refreshed custom domains cache: ${customDomainsCache.size} domains`);
    } catch (error) {
        console.error('[CORS] Failed to refresh custom domains cache:', error);
    }
}

// Check if origin is allowed
async function isOriginAllowed(origin: string | undefined): Promise<boolean> {
    if (!origin) return true; // Allow requests without Origin header (same-origin, curl, etc.)

    // Check static origins
    if (STATIC_ALLOWED_ORIGINS.includes(origin)) return true;

    // Refresh cache if stale
    if (Date.now() - cacheLastUpdated > CACHE_TTL_MS) {
        await refreshCustomDomainsCache();
    }

    // Check custom domains
    return customDomainsCache.has(origin.toLowerCase());
}

// Initialize cache on startup
refreshCustomDomainsCache();

// Dynamic CORS middleware
app.use(cors({
    origin: async (origin, callback) => {
        const allowed = await isOriginAllowed(origin);
        if (allowed) {
            callback(null, origin || true);
        } else {
            console.log(`[CORS] Blocked origin: ${origin}`);
            callback(null, false);
        }
    },
    credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded files in mock mode
if (process.env.USE_MOCK_SERVICES === 'true') {
    app.use('/uploads', express.static('uploads'));
}

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/galleries', galleryRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/sections', sectionRoutes);
app.use('/api/selections', selectionRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/print-requests', printRoutes);
app.use('/api/face', faceRoutes);
app.use('/api/studios', studioRoutes);

// Error handling
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📦 Mock services: ${process.env.USE_MOCK_SERVICES === 'true' ? 'ENABLED' : 'DISABLED'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down...');
    await prisma.$disconnect();
    process.exit(0);
});
