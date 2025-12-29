/**
 * Mock Face Recognition Service
 * 
 * Deterministic face matching for testing UI flows.
 * Uses filename patterns to simulate face detection and matching.
 * 
 * DETERMINISTIC MATCHING RULES:
 * - Photos with "face1" in filename match selfies with "face1"
 * - Photos with "face2" in filename match selfies with "face2"
 * - Photos with "group" match all selfies
 * - Default: ~30% random match rate for variety
 * 
 * This allows predictable testing of:
 * - Guest access flows
 * - Photo filtering by matched faces
 * - Download permission enforcement
 */

import { v4 as uuid } from 'uuid';
import {
    IFaceRecognitionService,
    FaceDetectionResult,
    FaceMatchResult,
} from '../interfaces/face-recognition.interface.js';
import { prisma } from '../../index.js';

// Deterministic seed for consistent mock results
function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

export class MockFaceRecognitionService implements IFaceRecognitionService {

    getProviderName(): string {
        return 'mock';
    }

    /**
     * Generate deterministic face IDs based on filename patterns.
     * This allows predictable testing scenarios.
     */
    async indexFaces(
        imageBuffer: Buffer,
        photoId: string,
        galleryId: string
    ): Promise<FaceDetectionResult[]> {
        // Get photo filename from database
        const photo = await prisma.photo.findUnique({
            where: { id: photoId },
            select: { filename: true },
        });

        if (!photo) {
            return [];
        }

        const filename = photo.filename.toLowerCase();
        const faces: FaceDetectionResult[] = [];

        // Deterministic face detection based on filename patterns
        // Pattern: "face1", "face2", "face3" etc. in filename
        const facePatterns = ['face1', 'face2', 'face3', 'face4', 'face5'];

        for (const pattern of facePatterns) {
            if (filename.includes(pattern)) {
                faces.push({
                    externalFaceId: `mock-${pattern}-${uuid().slice(0, 8)}`,
                    confidence: 99.5,
                    boundingBox: {
                        left: 0.2 + (facePatterns.indexOf(pattern) * 0.1),
                        top: 0.2,
                        width: 0.15,
                        height: 0.2,
                    },
                });
            }
        }

        // "group" photos have multiple faces
        if (filename.includes('group')) {
            faces.push(
                {
                    externalFaceId: `mock-group-a-${uuid().slice(0, 8)}`,
                    confidence: 98.0,
                    boundingBox: { left: 0.1, top: 0.2, width: 0.15, height: 0.2 },
                },
                {
                    externalFaceId: `mock-group-b-${uuid().slice(0, 8)}`,
                    confidence: 97.5,
                    boundingBox: { left: 0.4, top: 0.2, width: 0.15, height: 0.2 },
                },
                {
                    externalFaceId: `mock-group-c-${uuid().slice(0, 8)}`,
                    confidence: 96.0,
                    boundingBox: { left: 0.7, top: 0.2, width: 0.15, height: 0.2 },
                }
            );
        }

        // Default: generate 1 face if no patterns matched
        if (faces.length === 0) {
            // Use hash for deterministic "random" face generation
            const hash = hashString(filename);
            if (hash % 3 === 0) { // ~33% of photos have a detectable face
                faces.push({
                    externalFaceId: `mock-auto-${hash.toString(16)}`,
                    confidence: 85 + (hash % 15),
                    boundingBox: {
                        left: 0.3,
                        top: 0.2,
                        width: 0.2,
                        height: 0.25,
                    },
                });
            }
        }

        // Store face data in database
        for (const face of faces) {
            await prisma.faceData.create({
                data: {
                    externalFaceId: face.externalFaceId,
                    provider: 'mock',
                    confidence: face.confidence,
                    boundingBox: face.boundingBox,
                    photoId,
                },
            });
        }

        return faces;
    }

    /**
     * Deterministic face matching based on patterns.
     * Selfie filename/content determines which photos match.
     */
    async searchFaces(
        selfieBuffer: Buffer,
        galleryId: string,
        threshold = 80
    ): Promise<FaceMatchResult[]> {
        // In mock mode, we use a header or query param to specify which face to match
        // For now, we'll match based on a simple hash of the selfie buffer
        const selfieHash = hashString(selfieBuffer.toString('base64').slice(0, 100));

        // Get all face data for this gallery
        const faceData = await prisma.faceData.findMany({
            where: {
                photo: {
                    galleryId,
                },
            },
            include: {
                photo: {
                    select: { id: true, filename: true },
                },
            },
        });

        const matches: FaceMatchResult[] = [];
        const matchedPhotoIds = new Set<string>();

        for (const face of faceData) {
            // Deterministic matching logic
            let shouldMatch = false;
            let similarity = 0;

            // Pattern-based matching
            const faceIdLower = face.externalFaceId.toLowerCase();

            // "group" photos always match
            if (faceIdLower.includes('group')) {
                shouldMatch = true;
                similarity = 85 + (selfieHash % 10);
            }
            // Numbered faces match based on selfie hash
            else if (faceIdLower.includes('face1') && selfieHash % 5 === 0) {
                shouldMatch = true;
                similarity = 92 + (selfieHash % 8);
            }
            else if (faceIdLower.includes('face2') && selfieHash % 5 === 1) {
                shouldMatch = true;
                similarity = 90 + (selfieHash % 10);
            }
            else if (faceIdLower.includes('face3') && selfieHash % 5 === 2) {
                shouldMatch = true;
                similarity = 88 + (selfieHash % 12);
            }
            // Auto-generated faces: ~30% match rate
            else if (faceIdLower.includes('auto')) {
                const photoHash = hashString(face.photo.id);
                if ((selfieHash + photoHash) % 3 === 0) {
                    shouldMatch = true;
                    similarity = 80 + ((selfieHash + photoHash) % 15);
                }
            }

            if (shouldMatch && similarity >= threshold && !matchedPhotoIds.has(face.photo.id)) {
                matches.push({
                    photoId: face.photo.id,
                    similarity,
                    matchedFaceId: face.externalFaceId,
                });
                matchedPhotoIds.add(face.photo.id);
            }
        }

        // Sort by similarity (highest first)
        return matches.sort((a, b) => b.similarity - a.similarity);
    }

    async deleteFaces(photoId: string, galleryId: string): Promise<void> {
        await prisma.faceData.deleteMany({
            where: { photoId },
        });
    }

    async deleteGalleryFaces(galleryId: string): Promise<void> {
        await prisma.faceData.deleteMany({
            where: {
                photo: {
                    galleryId,
                },
            },
        });
    }
}

// Singleton instance
export const mockFaceRecognitionService = new MockFaceRecognitionService();
