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

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
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
