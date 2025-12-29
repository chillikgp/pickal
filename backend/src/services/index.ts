/**
 * Service Factory
 * 
 * Returns appropriate service implementations based on environment.
 * Switch between mock and AWS services via USE_MOCK_SERVICES env var.
 */

import { IStorageService } from './interfaces/storage.interface.js';
import { IFaceRecognitionService } from './interfaces/face-recognition.interface.js';
import { mockStorageService } from './mock/storage.service.js';
import { mockFaceRecognitionService } from './mock/face-recognition.service.js';

// Storage service instance
let storageService: IStorageService | null = null;

export function getStorageService(): IStorageService {
    if (!storageService) {
        if (process.env.USE_MOCK_SERVICES === 'true') {
            storageService = mockStorageService;
        } else {
            // TODO: Implement and import AWS S3 service
            // storageService = new S3StorageService();
            console.warn('AWS S3 service not implemented, falling back to mock');
            storageService = mockStorageService;
        }
    }
    return storageService;
}

// Face recognition service instance
let faceRecognitionService: IFaceRecognitionService | null = null;

export function getFaceRecognitionService(): IFaceRecognitionService {
    if (!faceRecognitionService) {
        if (process.env.USE_MOCK_SERVICES === 'true') {
            faceRecognitionService = mockFaceRecognitionService;
        } else {
            // TODO: Implement and import AWS Rekognition service
            // faceRecognitionService = new RekognitionService();
            console.warn('AWS Rekognition service not implemented, falling back to mock');
            faceRecognitionService = mockFaceRecognitionService;
        }
    }
    return faceRecognitionService;
}
