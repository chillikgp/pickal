'use client';

/**
 * useUpload Hook
 * 
 * Manages upload state and orchestrates the upload flow.
 * Provides a clean interface for components to trigger uploads
 * and receive progress updates.
 */

import { useState, useCallback, useRef } from 'react';
import { photoApi } from '@/lib/api';
import {
    UploadFile,
    UploadProgress,
    createUploadQueue,
    uploadFiles,
    retryFailedFiles,
    getValidFiles,
    getFailedFiles,
    getValidationSummary,
} from '@/lib/upload-queue';

export type UploadPhase = 'idle' | 'validation' | 'uploading' | 'completed' | 'completedWithErrors';

export interface UseUploadReturn {
    /** Current upload queue */
    queue: UploadFile[];
    /** Current phase of upload flow */
    phase: UploadPhase;
    /** Whether upload is in progress */
    isUploading: boolean;
    /** Current progress (undefined before upload starts) */
    progress: UploadProgress | undefined;
    /** Start upload flow with selected files */
    startUpload: (files: FileList | File[]) => void;
    /** Proceed with upload after validation */
    proceedWithUpload: () => void;
    /** Cancel/dismiss the upload panel */
    cancelUpload: () => void;
    /** Retry failed files */
    retryFailed: () => void;
}

interface UseUploadOptions {
    galleryId: string;
    sectionId?: string;
    onComplete?: () => void;
}

export function useUpload({ galleryId, sectionId, onComplete }: UseUploadOptions): UseUploadReturn {
    const [queue, setQueue] = useState<UploadFile[]>([]);
    const [phase, setPhase] = useState<UploadPhase>('idle');
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState<UploadProgress>();

    // AbortController for cancellation
    const abortControllerRef = useRef<AbortController | null>(null);

    // Upload function that uses the API
    const uploadFn = useCallback(async (files: File[], gId: string, sId?: string) => {
        await photoApi.upload(gId, files, sId);
    }, []);

    // Start upload flow - validate files and show preview
    const startUpload = useCallback((files: FileList | File[]) => {
        const uploadQueue = createUploadQueue(files);
        setQueue(uploadQueue);
        setPhase('validation');
        setProgress(undefined);
    }, []);

    // Proceed with upload after validation confirmation
    const proceedWithUpload = useCallback(async () => {
        if (getValidFiles(queue).length === 0) return;

        setIsUploading(true);
        setPhase('uploading');

        // Create abort controller
        abortControllerRef.current = new AbortController();

        try {
            const updatedQueue = await uploadFiles(
                queue,
                uploadFn,
                {
                    galleryId,
                    sectionId,
                    signal: abortControllerRef.current.signal,
                    onProgress: (prog) => {
                        setProgress(prog);
                    },
                    onFileComplete: (file, success) => {
                        // Update queue with new status
                        setQueue(prev => prev.map(f =>
                            f.id === file.id ? file : f
                        ));
                    },
                }
            );

            setQueue(updatedQueue);

            // Determine final phase
            const failed = getFailedFiles(updatedQueue).length;
            const invalid = updatedQueue.filter(f => f.status === 'invalid').length;

            if (failed > 0 || invalid > 0) {
                setPhase('completedWithErrors');
            } else {
                setPhase('completed');
            }

            onComplete?.();
        } catch (error) {
            console.error('[UPLOAD] Error:', error);
            setPhase('completedWithErrors');
        } finally {
            setIsUploading(false);
            abortControllerRef.current = null;
        }
    }, [queue, uploadFn, galleryId, sectionId, onComplete]);

    // Cancel upload
    const cancelUpload = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        setQueue([]);
        setPhase('idle');
        setIsUploading(false);
        setProgress(undefined);
    }, []);

    // Retry failed files
    const retryFailed = useCallback(async () => {
        const failedFiles = getFailedFiles(queue);
        if (failedFiles.length === 0) return;

        setIsUploading(true);
        setPhase('uploading');

        abortControllerRef.current = new AbortController();

        try {
            const updatedQueue = await retryFailedFiles(
                queue,
                uploadFn,
                {
                    galleryId,
                    sectionId,
                    signal: abortControllerRef.current.signal,
                    onProgress: setProgress,
                    onFileComplete: (file) => {
                        setQueue(prev => prev.map(f =>
                            f.id === file.id ? file : f
                        ));
                    },
                }
            );

            setQueue(updatedQueue);

            const stillFailed = getFailedFiles(updatedQueue).length;
            if (stillFailed > 0) {
                setPhase('completedWithErrors');
            } else {
                setPhase('completed');
            }

            onComplete?.();
        } catch (error) {
            console.error('[UPLOAD_RETRY] Error:', error);
            setPhase('completedWithErrors');
        } finally {
            setIsUploading(false);
            abortControllerRef.current = null;
        }
    }, [queue, uploadFn, galleryId, sectionId, onComplete]);

    return {
        queue,
        phase,
        isUploading,
        progress,
        startUpload,
        proceedWithUpload,
        cancelUpload,
        retryFailed,
    };
}

export default useUpload;
