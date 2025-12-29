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
            try {
                const { s3StorageService } = require('./aws/storage.service.js');
                storageService = s3StorageService;
                console.log('✅ Using AWS S3 for storage');
            } catch (error: any) {
                console.warn('⚠️  Failed to initialize S3:', error.message);
                storageService = mockStorageService;
            }
        }
    }
    return storageService!;
}

// Face recognition service instance
let faceRecognitionService: IFaceRecognitionService | null = null;

export function getFaceRecognitionService(): IFaceRecognitionService {
    if (!faceRecognitionService) {
        if (process.env.USE_MOCK_SERVICES === 'true') {
            faceRecognitionService = mockFaceRecognitionService;
        } else {
            try {
                const { rekognitionService } = require('./aws/face-recognition.service.js');
                faceRecognitionService = rekognitionService;
                console.log('✅ Using AWS Rekognition for face recognition');
            } catch (error: any) {
                console.warn('⚠️  Failed to initialize Rekognition:', error.message);
                faceRecognitionService = mockFaceRecognitionService;
            }
        }
    }
    return faceRecognitionService!;
}

