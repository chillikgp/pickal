/**
 * AWS Rekognition Face Recognition Service
 */

import {
    RekognitionClient,
    IndexFacesCommand,
    SearchFacesByImageCommand,
    DeleteFacesCommand,
    CreateCollectionCommand,
    ListCollectionsCommand,
} from '@aws-sdk/client-rekognition';
import { IFaceRecognitionService, FaceDetectionResult, FaceMatchResult } from '../interfaces/face-recognition.interface.js';
import { prisma } from '../../index.js';

export class RekognitionService implements IFaceRecognitionService {
    private client: RekognitionClient;
    private collectionId: string;
    private initialized = false;

    constructor() {
        this.client = new RekognitionClient({
            region: process.env.AWS_REGION || 'ap-south-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
            },
        });
        this.collectionId = process.env.REKOGNITION_COLLECTION_ID || 'pickal-faces';
    }

    private async ensureCollection(): Promise<void> {
        if (this.initialized) return;
        try {
            const { CollectionIds } = await this.client.send(new ListCollectionsCommand({}));
            if (!CollectionIds?.includes(this.collectionId)) {
                await this.client.send(new CreateCollectionCommand({ CollectionId: this.collectionId }));
                console.log(`Created Rekognition collection: ${this.collectionId}`);
            }
            this.initialized = true;
        } catch (error) {
            console.error('Failed to initialize Rekognition collection:', error);
            throw error;
        }
    }

    getProviderName(): string {
        return 'AWS Rekognition';
    }

    async indexFaces(imageBuffer: Buffer, photoId: string, galleryId: string): Promise<FaceDetectionResult[]> {
        await this.ensureCollection();

        try {
            const response = await this.client.send(new IndexFacesCommand({
                CollectionId: this.collectionId,
                Image: { Bytes: imageBuffer },
                ExternalImageId: photoId,
                DetectionAttributes: ['DEFAULT'],
                MaxFaces: 10,
                QualityFilter: 'AUTO',
            }));

            const faces: FaceDetectionResult[] = [];

            for (const record of response.FaceRecords || []) {
                if (record.Face?.FaceId) {
                    const face: FaceDetectionResult = {
                        externalFaceId: record.Face.FaceId,
                        confidence: record.Face.Confidence || 0,
                        boundingBox: record.Face.BoundingBox ? {
                            left: record.Face.BoundingBox.Left || 0,
                            top: record.Face.BoundingBox.Top || 0,
                            width: record.Face.BoundingBox.Width || 0,
                            height: record.Face.BoundingBox.Height || 0,
                        } : undefined,
                    };
                    faces.push(face);

                    // Store in database
                    await prisma.faceData.create({
                        data: {
                            externalFaceId: face.externalFaceId,
                            provider: 'rekognition',
                            confidence: face.confidence,
                            boundingBox: face.boundingBox,
                            photoId,
                        },
                    });
                }
            }

            return faces;
        } catch (error) {
            console.error(`Failed to index faces for photo ${photoId}:`, error);
            return [];
        }
    }

    async searchFaces(selfieBuffer: Buffer, galleryId: string, threshold = 80): Promise<FaceMatchResult[]> {
        await this.ensureCollection();

        try {
            console.log(`[REKOGNITION] Searching faces in collection: ${this.collectionId}`);
            const response = await this.client.send(new SearchFacesByImageCommand({
                CollectionId: this.collectionId,
                Image: { Bytes: selfieBuffer },
                MaxFaces: 100,
                FaceMatchThreshold: threshold,
            }));

            console.log(`[REKOGNITION] Raw FaceMatches count: ${response.FaceMatches?.length || 0}`);
            if (response.FaceMatches?.length) {
                console.log(`[REKOGNITION] First match:`, JSON.stringify(response.FaceMatches[0], null, 2));
            }

            if (!response.FaceMatches?.length) return [];

            // Get photo IDs for this gallery to filter results
            const galleryPhotoIds = await prisma.photo.findMany({
                where: { galleryId },
                select: { id: true },
            });
            const validPhotoIds = new Set(galleryPhotoIds.map(p => p.id));

            const results: FaceMatchResult[] = [];
            const seenPhotoIds = new Set<string>();

            for (const match of response.FaceMatches) {
                // ExternalImageId is the photoId we set during indexFaces
                const photoId = match.Face?.ExternalImageId;
                const faceId = match.Face?.FaceId;

                if (!photoId || !faceId) continue;

                // Only include photos from this gallery
                if (validPhotoIds.has(photoId) && !seenPhotoIds.has(photoId)) {
                    seenPhotoIds.add(photoId);
                    results.push({
                        photoId,
                        similarity: match.Similarity || 0,
                        matchedFaceId: faceId,
                    });
                }
            }

            return results.sort((a, b) => b.similarity - a.similarity);
        } catch (error: any) {
            if (error.name === 'InvalidParameterException') {
                console.log('No face detected in selfie');
                return [];
            }
            console.error('Failed to search faces:', error);
            return [];
        }
    }

    async deleteFaces(photoId: string, galleryId: string): Promise<void> {
        await this.ensureCollection();

        try {
            const faceData = await prisma.faceData.findMany({
                where: { photoId },
                select: { externalFaceId: true },
            });

            if (faceData.length > 0) {
                await this.client.send(new DeleteFacesCommand({
                    CollectionId: this.collectionId,
                    FaceIds: faceData.map(f => f.externalFaceId),
                }));
            }

            await prisma.faceData.deleteMany({ where: { photoId } });
        } catch (error) {
            console.error(`Failed to delete faces for photo ${photoId}:`, error);
        }
    }

    async deleteGalleryFaces(galleryId: string): Promise<void> {
        await this.ensureCollection();

        try {
            const faceData = await prisma.faceData.findMany({
                where: { photo: { galleryId } },
                select: { externalFaceId: true },
            });

            if (faceData.length > 0) {
                // Delete in batches of 100
                for (let i = 0; i < faceData.length; i += 100) {
                    const batch = faceData.slice(i, i + 100);
                    await this.client.send(new DeleteFacesCommand({
                        CollectionId: this.collectionId,
                        FaceIds: batch.map(f => f.externalFaceId),
                    }));
                }
            }

            await prisma.faceData.deleteMany({ where: { photo: { galleryId } } });
        } catch (error) {
            console.error(`Failed to delete faces for gallery ${galleryId}:`, error);
        }
    }
}

export const rekognitionService = new RekognitionService();
