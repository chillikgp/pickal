'use client';

/**
 * UploadPanel Component
 * 
 * Sticky panel showing upload progress, per-file states, and retry functionality.
 * Designed to handle thousands of files without performance issues.
 * 
 * Features:
 * - Overall progress (e.g., "Uploading 1,240 of 5,000 photos")
 * - Batch progress (e.g., "Batch 12 of 100")
 * - Collapsible file list with status badges
 * - Validation summary for skipped files
 * - Retry button for failed uploads
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    UploadFile,
    UploadProgress,
    ValidationSummary,
    getValidationSummary,
} from '@/lib/upload-queue';

// =============================================================================
// ICONS
// =============================================================================

const CheckIcon = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
);

const XIcon = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const AlertIcon = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
);

const LoaderIcon = () => (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
);

const ChevronDownIcon = ({ expanded }: { expanded: boolean }) => (
    <svg
        className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
    >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
);

// =============================================================================
// TYPES
// =============================================================================

type UploadPhase = 'validation' | 'uploading' | 'completed' | 'completedWithErrors';

interface UploadPanelProps {
    /** All files in the queue (including invalid) */
    queue: UploadFile[];
    /** Current upload progress (undefined before upload starts) */
    progress?: UploadProgress;
    /** Current phase of upload */
    phase: UploadPhase;
    /** Whether upload is currently in progress */
    isUploading: boolean;
    /** Called when user clicks retry */
    onRetry: () => void;
    /** Called when user dismisses the panel */
    onDismiss: () => void;
    /** Called when user confirms to proceed after validation */
    onProceed: () => void;
    /** Called when user cancels upload */
    onCancel: () => void;
}

// =============================================================================
// STATUS BADGE
// =============================================================================

function StatusBadge({ status }: { status: UploadFile['status'] }) {
    switch (status) {
        case 'pending':
            return <Badge variant="secondary" className="text-xs">Pending</Badge>;
        case 'uploading':
            return (
                <Badge variant="default" className="text-xs bg-blue-500">
                    <LoaderIcon />
                    <span className="ml-1">Uploading</span>
                </Badge>
            );
        case 'uploaded':
            return (
                <Badge variant="default" className="text-xs bg-green-500">
                    <CheckIcon />
                    <span className="ml-1">Done</span>
                </Badge>
            );
        case 'failed':
            return (
                <Badge variant="destructive" className="text-xs">
                    <XIcon />
                    <span className="ml-1">Failed</span>
                </Badge>
            );
        case 'invalid':
            return (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">
                    <AlertIcon />
                    <span className="ml-1">Skipped</span>
                </Badge>
            );
    }
}

// =============================================================================
// VIRTUALIZED FILE LIST
// =============================================================================

const MAX_VISIBLE_FILES = 50; // Show only first 50 files to prevent DOM bloat

function FileList({ files, expanded }: { files: UploadFile[]; expanded: boolean }) {
    if (!expanded) return null;

    // Only render a subset to prevent memory issues with thousands of files
    const visibleFiles = files.slice(0, MAX_VISIBLE_FILES);
    const hiddenCount = files.length - visibleFiles.length;

    return (
        <div className="mt-3 max-h-48 overflow-y-auto border rounded-md divide-y">
            {visibleFiles.map((file) => (
                <div
                    key={file.id}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                >
                    <span className="truncate flex-1 mr-2" title={file.file.name}>
                        {file.file.name}
                    </span>
                    <div className="flex items-center gap-2">
                        {file.error && (
                            <span className="text-xs text-red-500 max-w-[150px] truncate" title={file.error}>
                                {file.error}
                            </span>
                        )}
                        <StatusBadge status={file.status} />
                    </div>
                </div>
            ))}
            {hiddenCount > 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground text-center">
                    ... and {hiddenCount.toLocaleString()} more files
                </div>
            )}
        </div>
    );
}

// =============================================================================
// VALIDATION SUMMARY
// =============================================================================

function ValidationSummaryView({ summary }: { summary: ValidationSummary }) {
    if (summary.invalidFiles === 0) return null;

    return (
        <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
            <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">
                {summary.invalidFiles} file{summary.invalidFiles > 1 ? 's' : ''} will be skipped
            </p>
            <ul className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                {summary.invalidReasons.map(({ reason, count }) => (
                    <li key={reason}>• {count}× {reason}</li>
                ))}
            </ul>
        </div>
    );
}

// =============================================================================
// PROGRESS BAR
// =============================================================================

function ProgressBar({ value, max }: { value: number; max: number }) {
    const percent = max > 0 ? Math.round((value / max) * 100) : 0;
    return (
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2">
            <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${percent}%` }}
            />
        </div>
    );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function UploadPanel({
    queue,
    progress,
    phase,
    isUploading,
    onRetry,
    onDismiss,
    onProceed,
    onCancel,
}: UploadPanelProps) {
    const [expanded, setExpanded] = useState(false);

    // Compute validation summary
    const summary = useMemo(() => getValidationSummary(queue), [queue]);

    // Compute display stats
    const stats = useMemo(() => {
        const uploaded = queue.filter(f => f.status === 'uploaded').length;
        const failed = queue.filter(f => f.status === 'failed').length;
        const invalid = queue.filter(f => f.status === 'invalid').length;
        const pending = queue.filter(f => f.status === 'pending').length;
        const uploading = queue.filter(f => f.status === 'uploading').length;
        return { uploaded, failed, invalid, pending, uploading, total: queue.length };
    }, [queue]);

    // Add beforeunload warning during upload
    useEffect(() => {
        if (!isUploading) return;

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = 'Uploads are in progress. Are you sure you want to leave?';
            return e.returnValue;
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isUploading]);

    // Render content based on phase
    const renderContent = () => {
        switch (phase) {
            case 'validation':
                return (
                    <>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium">Ready to upload {summary.validFiles.toLocaleString()} photos</p>
                                <p className="text-sm text-muted-foreground">
                                    {summary.totalFiles.toLocaleString()} selected
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={onDismiss}>
                                    Cancel
                                </Button>
                                <Button size="sm" onClick={onProceed} disabled={summary.validFiles === 0}>
                                    Upload
                                </Button>
                            </div>
                        </div>
                        <ValidationSummaryView summary={summary} />
                    </>
                );

            case 'uploading':
                return (
                    <>
                        <div className="flex items-center justify-between">
                            <div className="flex-1">
                                <p className="font-medium">
                                    Uploading {(progress?.completedFiles || 0).toLocaleString()} of {(progress?.totalFiles || summary.validFiles).toLocaleString()} photos
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    Batch {progress?.currentBatch || 1} of {progress?.totalBatches || 1}
                                </p>
                            </div>
                            <Button variant="outline" size="sm" onClick={onCancel}>
                                Cancel
                            </Button>
                        </div>
                        <ProgressBar
                            value={progress?.completedFiles || 0}
                            max={progress?.totalFiles || summary.validFiles}
                        />
                        <p className="text-xs text-muted-foreground mt-2">
                            Large uploads may take time. Please keep this tab open.
                        </p>
                    </>
                );

            case 'completed':
                return (
                    <>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                                    <CheckIcon />
                                </div>
                                <div>
                                    <p className="font-medium text-green-600 dark:text-green-400">
                                        Upload complete
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {stats.uploaded.toLocaleString()} photos uploaded
                                    </p>
                                </div>
                            </div>
                            <Button variant="outline" size="sm" onClick={onDismiss}>
                                Done
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Photos are now processing. They will appear in the gallery shortly.
                        </p>
                    </>
                );

            case 'completedWithErrors':
                return (
                    <>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                                    <AlertIcon />
                                </div>
                                <div>
                                    <p className="font-medium">Upload completed with issues</p>
                                    <p className="text-sm text-muted-foreground">
                                        ✅ {stats.uploaded.toLocaleString()} uploaded
                                        {stats.failed > 0 && <> • ❌ {stats.failed.toLocaleString()} failed</>}
                                        {stats.invalid > 0 && <> • ⚠️ {stats.invalid.toLocaleString()} skipped</>}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {stats.failed > 0 && (
                                    <Button variant="default" size="sm" onClick={onRetry}>
                                        Retry Failed
                                    </Button>
                                )}
                                <Button variant="outline" size="sm" onClick={onDismiss}>
                                    Done
                                </Button>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            {stats.failed > 0
                                ? 'Some photos failed to upload. You can retry them safely.'
                                : 'Photos are now processing.'}
                        </p>
                    </>
                );
        }
    };

    return (
        <Card className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-[450px] p-4 shadow-lg z-50 border-2">
            {renderContent()}

            {/* Expandable file list */}
            {queue.length > 0 && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="mt-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ChevronDownIcon expanded={expanded} />
                    {expanded ? 'Hide' : 'Show'} file list ({queue.length.toLocaleString()} files)
                </button>
            )}

            <FileList files={queue} expanded={expanded} />
        </Card>
    );
}

export default UploadPanel;
