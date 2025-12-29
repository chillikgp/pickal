/**
 * Face Recognition Service Interface
 * 
 * Abstracts face recognition operations. Implementations:
 * - MockFaceRecognitionService: Deterministic matches for testing
 * - RekognitionService: AWS Rekognition for production
 * - (Future) ArcFaceService: Self-hosted ArcFace model
 * 
 * IMPORTANT: Stores only FaceIds (external references), NOT raw face images.
 * Schema is designed to be extensible for vector embeddings later.
 */

export interface FaceDetectionResult {
    /** External face ID from the provider (e.g., Rekognition FaceId) */
    externalFaceId: string;

    /** Detection confidence score (0-100) */
    confidence: number;

    /** Face bounding box (normalized 0-1 coordinates) */
    boundingBox?: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
}

export interface FaceMatchResult {
    /** ID of the matched photo */
    photoId: string;

    /** Match similarity score (0-100) */
    similarity: number;

    /** External face ID that matched */
    matchedFaceId: string;
}

export interface IFaceRecognitionService {
    /**
     * Index faces in an image for later matching.
     * Called when a photo is uploaded.
     * 
     * @param imageBuffer - Image buffer to analyze
     * @param photoId - Photo ID to associate with detected faces
     * @param galleryId - Gallery ID for organizing face collections
     * @returns Array of detected faces with their external IDs
     */
    indexFaces(
        imageBuffer: Buffer,
        photoId: string,
        galleryId: string
    ): Promise<FaceDetectionResult[]>;

    /**
     * Search for matching faces in a gallery using a selfie.
     * Returns photos that contain matching faces.
     * 
     * @param selfieBuffer - Selfie image buffer to search with
     * @param galleryId - Gallery to search within
     * @param threshold - Minimum similarity threshold (default: 80)
     * @returns Array of matching photos with similarity scores
     */
    searchFaces(
        selfieBuffer: Buffer,
        galleryId: string,
        threshold?: number
    ): Promise<FaceMatchResult[]>;

    /**
     * Delete all indexed faces for a photo.
     * Called when a photo is deleted.
     * 
     * @param photoId - Photo ID whose faces should be deleted
     * @param galleryId - Gallery ID for the face collection
     */
    deleteFaces(photoId: string, galleryId: string): Promise<void>;

    /**
     * Delete all face data for a gallery.
     * Called when a gallery is deleted.
     * 
     * @param galleryId - Gallery ID to clean up
     */
    deleteGalleryFaces(galleryId: string): Promise<void>;

    /**
     * Get the provider name for this service
     */
    getProviderName(): string;
}
