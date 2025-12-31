
import { prisma } from '../index.js';

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetInSeconds: number;
    error?: string;
}

export class RateLimitService {
    private static MAX_ATTEMPTS = 10;
    private static WINDOW_SECONDS = 3600; // 1 hour

    /**
     * Check and enforce rate limits for guest selfie attempts
     */
    static async checkSelfieLimit(galleryId: string, guestSessionId: string): Promise<RateLimitResult> {
        const now = new Date();
        const windowStart = new Date(now.getTime() - this.WINDOW_SECONDS * 1000);

        // Find or create rate limit record
        // Uses upsert to handle race conditions (though simple unique constraint is enough)
        let rateLimit = await prisma.selfieRateLimit.findUnique({
            where: { guestSessionId },
        });

        // If no record, create one
        if (!rateLimit) {
            rateLimit = await prisma.selfieRateLimit.create({
                data: {
                    galleryId,
                    guestSessionId,
                    attemptCount: 1,
                    windowStart: now,
                },
            });
            return {
                allowed: true,
                remaining: this.MAX_ATTEMPTS - 1,
                resetInSeconds: this.WINDOW_SECONDS,
            };
        }

        // Check if window has expired
        const windowAgeSeconds = (now.getTime() - rateLimit.windowStart.getTime()) / 1000;

        if (windowAgeSeconds > this.WINDOW_SECONDS) {
            // Window expired, reset counter
            rateLimit = await prisma.selfieRateLimit.update({
                where: { id: rateLimit.id },
                data: {
                    attemptCount: 1,
                    windowStart: now,
                },
            });
            return {
                allowed: true,
                remaining: this.MAX_ATTEMPTS - 1,
                resetInSeconds: this.WINDOW_SECONDS,
            };
        }

        // Check if limit exceeded
        if (rateLimit.attemptCount >= this.MAX_ATTEMPTS) {
            const resetIn = Math.ceil(this.WINDOW_SECONDS - windowAgeSeconds);
            return {
                allowed: false,
                remaining: 0,
                resetInSeconds: resetIn,
                error: `Rate limit exceeded. Try again in ${Math.ceil(resetIn / 60)} minutes.`,
            };
        }

        // Increment counter
        rateLimit = await prisma.selfieRateLimit.update({
            where: { id: rateLimit.id },
            data: {
                attemptCount: { increment: 1 },
            },
        });

        return {
            allowed: true,
            remaining: this.MAX_ATTEMPTS - rateLimit.attemptCount,
            resetInSeconds: Math.ceil(this.WINDOW_SECONDS - windowAgeSeconds),
        };
    }
}
