/**
 * Upload Queue Utility (v1)
 * 
 * Provides validation, batching, and controlled concurrency for bulk photo uploads.
 * Designed to handle 5,000+ photos safely without blocking the main thread or
 * overwhelming backend/network resources.
 * 
 * Key Features:
 * - Client-side validation (file size, MIME type)
 * - Automatic batching (max 50 files per request)
 * - Promise pool for controlled concurrency (4 desktop, 2 mobile)
 * - Per-file status tracking with error messages
 */

// =============================================================================
// CONSTANTS
// =============================================================================

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_FILES_PER_BATCH = 50;
export const MAX_PARALLEL_UPLOADS_DESKTOP = 4;
export const MAX_PARALLEL_UPLOADS_MOBILE = 2;

export const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
] as const;

// =============================================================================
// TYPES
// =============================================================================

export type UploadStatus = 'pending' | 'uploading' | 'uploaded' | 'failed' | 'invalid';

export interface UploadFile {
    /** Unique ID for tracking */
    id: string;
    /** Original File object */
    file: File;
    /** Current upload status */
    status: UploadStatus;
    /** Error message if failed or invalid */
    error?: string;
    /** Upload progress 0-100 (not used in v1, reserved for future) */
    progress?: number;
}

export interface UploadProgress {
    /** Total files being processed (valid only) */
    totalFiles: number;
    /** Files completed (uploaded or failed) */
    completedFiles: number;
    /** Current batch number (1-indexed) */
    currentBatch: number;
    /** Total number of batches */
    totalBatches: number;
    /** Counts by status */
    uploaded: number;
    failed: number;
    invalid: number;
}

export interface ValidationResult {
    valid: boolean;
    error?: string;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validates a single file for size and MIME type.
 * Returns validation result with error message if invalid.
 */
export function validateFile(file: File): ValidationResult {
    // Check file size (20 MB limit)
    if (file.size > MAX_FILE_SIZE_BYTES) {
        return {
            valid: false,
            error: `File exceeds 20 MB limit (${formatFileSize(file.size)})`,
        };
    }

    // Check MIME type
    // Note: Some browsers may not report HEIC correctly, so we also accept empty MIME
    // for files with .heic/.heif extension as a fallback
    const mimeType = file.type.toLowerCase();
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    const isAllowedMime = ALLOWED_MIME_TYPES.includes(mimeType as typeof ALLOWED_MIME_TYPES[number]);
    const isHeicByExtension = (ext === 'heic' || ext === 'heif') && (!mimeType || mimeType === 'application/octet-stream');

    if (!isAllowedMime && !isHeicByExtension) {
        return {
            valid: false,
            error: mimeType
                ? `Unsupported file format (${mimeType})`
                : 'Unsupported file format',
        };
    }

    return { valid: true };
}

/**
 * Formats file size in human-readable form.
 */
function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// =============================================================================
// QUEUE CREATION
// =============================================================================

/**
 * Creates an upload queue from selected files.
 * Validates each file and assigns unique IDs for tracking.
 * Invalid files are included but marked as 'invalid' status.
 */
export function createUploadQueue(files: FileList | File[]): UploadFile[] {
    const fileArray = Array.from(files);

    return fileArray.map((file, index) => {
        const validation = validateFile(file);
        return {
            id: `upload-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
            file,
            status: validation.valid ? 'pending' : 'invalid',
            error: validation.error,
        };
    });
}

/**
 * Gets only valid (pending) files from queue.
 */
export function getValidFiles(queue: UploadFile[]): UploadFile[] {
    return queue.filter(f => f.status === 'pending');
}

/**
 * Gets files that failed and can be retried.
 */
export function getFailedFiles(queue: UploadFile[]): UploadFile[] {
    return queue.filter(f => f.status === 'failed');
}

// =============================================================================
// BATCHING
// =============================================================================

/**
 * Splits files into batches of specified size.
 * Each batch will be uploaded as a single request.
 */
export function splitIntoBatches<T>(items: T[], batchSize: number = MAX_FILES_PER_BATCH): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
    }
    return batches;
}

// =============================================================================
// CONCURRENCY CONTROL
// =============================================================================

/**
 * Detects if the user is on a mobile device.
 * Used to adjust concurrency limits.
 */
export function isMobileDevice(): boolean {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Gets the appropriate concurrency limit based on device type.
 */
export function getConcurrencyLimit(): number {
    return isMobileDevice() ? MAX_PARALLEL_UPLOADS_MOBILE : MAX_PARALLEL_UPLOADS_DESKTOP;
}

/**
 * Promise pool that executes functions with controlled concurrency.
 * Unlike Promise.all, this ensures only N promises run at once.
 * 
 * @param items - Array of items to process
 * @param concurrency - Max parallel executions
 * @param fn - Async function to execute for each item
 * @param onProgress - Optional callback after each item completes
 */
export async function promisePool<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<R>,
    onProgress?: (completed: number, total: number) => void
): Promise<R[]> {
    const results: R[] = [];
    let completed = 0;
    let index = 0;

    // Worker function that pulls from the queue
    async function worker(): Promise<void> {
        while (index < items.length) {
            const currentIndex = index++;
            const item = items[currentIndex];

            try {
                const result = await fn(item);
                results[currentIndex] = result;
            } catch (error) {
                // Store error but continue processing
                results[currentIndex] = error as R;
            }

            completed++;
            onProgress?.(completed, items.length);
        }
    }

    // Start concurrent workers
    const workers = Array(Math.min(concurrency, items.length))
        .fill(null)
        .map(() => worker());

    await Promise.all(workers);
    return results;
}

// =============================================================================
// UPLOAD EXECUTION
// =============================================================================

export interface UploadBatchOptions {
    galleryId: string;
    sectionId?: string;
    /** Called after each file completes */
    onFileComplete?: (file: UploadFile, success: boolean) => void;
    /** Called after each batch completes */
    onBatchComplete?: (batchIndex: number, totalBatches: number) => void;
    /** Called with overall progress */
    onProgress?: (progress: UploadProgress) => void;
    /** Abort signal for cancellation */
    signal?: AbortSignal;
}

/**
 * Uploads files in batches with controlled concurrency.
 * This is the main entry point for the upload flow.
 * 
 * Flow:
 * 1. Filter to valid files only
 * 2. Split into batches of 50
 * 3. For each batch, upload files with concurrency of 4 (desktop) or 2 (mobile)
 * 4. Track progress and call callbacks
 * 
 * @returns Updated queue with final statuses
 */
export async function uploadFiles(
    queue: UploadFile[],
    uploadFn: (files: File[], galleryId: string, sectionId?: string) => Promise<void>,
    options: UploadBatchOptions
): Promise<UploadFile[]> {
    const { galleryId, sectionId, onFileComplete, onBatchComplete, onProgress, signal } = options;

    // Get only valid pending files
    const validFiles = getValidFiles(queue);
    if (validFiles.length === 0) {
        return queue;
    }

    // Split into batches
    const batches = splitIntoBatches(validFiles, MAX_FILES_PER_BATCH);
    const concurrency = getConcurrencyLimit();

    // Create mutable copy of queue for status updates
    const updatedQueue = [...queue];
    const findAndUpdate = (id: string, updates: Partial<UploadFile>) => {
        const idx = updatedQueue.findIndex(f => f.id === id);
        if (idx !== -1) {
            updatedQueue[idx] = { ...updatedQueue[idx], ...updates };
        }
    };

    // Track counts
    let uploaded = 0;
    let failed = 0;
    const invalid = queue.filter(f => f.status === 'invalid').length;

    // Process each batch sequentially
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        // Check for abort
        if (signal?.aborted) {
            break;
        }

        const batch = batches[batchIndex];

        // Mark batch files as uploading
        batch.forEach(f => findAndUpdate(f.id, { status: 'uploading' }));

        // Upload files in batch with concurrency
        await promisePool(
            batch,
            concurrency,
            async (uploadFile) => {
                if (signal?.aborted) return;

                try {
                    // Upload single file
                    await uploadFn([uploadFile.file], galleryId, sectionId);
                    findAndUpdate(uploadFile.id, { status: 'uploaded' });
                    uploaded++;
                    onFileComplete?.(updatedQueue.find(f => f.id === uploadFile.id)!, true);
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : 'Upload failed';
                    findAndUpdate(uploadFile.id, { status: 'failed', error: errorMsg });
                    failed++;
                    onFileComplete?.(updatedQueue.find(f => f.id === uploadFile.id)!, false);
                }

                // Report progress
                onProgress?.({
                    totalFiles: validFiles.length,
                    completedFiles: uploaded + failed,
                    currentBatch: batchIndex + 1,
                    totalBatches: batches.length,
                    uploaded,
                    failed,
                    invalid,
                });
            }
        );

        onBatchComplete?.(batchIndex + 1, batches.length);
    }

    return updatedQueue;
}

/**
 * Retries failed files from a previous upload attempt.
 * Resets failed files to pending and re-runs upload.
 */
export async function retryFailedFiles(
    queue: UploadFile[],
    uploadFn: (files: File[], galleryId: string, sectionId?: string) => Promise<void>,
    options: UploadBatchOptions
): Promise<UploadFile[]> {
    // Reset failed files to pending
    const resetQueue = queue.map(f =>
        f.status === 'failed' ? { ...f, status: 'pending' as UploadStatus, error: undefined } : f
    );

    return uploadFiles(resetQueue, uploadFn, options);
}

// =============================================================================
// VALIDATION SUMMARY
// =============================================================================

export interface ValidationSummary {
    totalFiles: number;
    validFiles: number;
    invalidFiles: number;
    invalidReasons: { reason: string; count: number }[];
}

/**
 * Generates a summary of validation results.
 * Useful for showing user before upload starts.
 */
export function getValidationSummary(queue: UploadFile[]): ValidationSummary {
    const invalidFiles = queue.filter(f => f.status === 'invalid');
    const reasonCounts = new Map<string, number>();

    invalidFiles.forEach(f => {
        const reason = f.error || 'Unknown error';
        reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
    });

    return {
        totalFiles: queue.length,
        validFiles: queue.length - invalidFiles.length,
        invalidFiles: invalidFiles.length,
        invalidReasons: Array.from(reasonCounts.entries()).map(([reason, count]) => ({ reason, count })),
    };
}
