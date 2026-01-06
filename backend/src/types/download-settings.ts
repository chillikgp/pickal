/**
 * Download Settings Types - DOWNLOAD_CONTROLS_V1
 * 
 * These types define the structure for gallery download controls.
 * Backend enforces all rules - frontend is advisory only.
 */

// -------------------------------------------------------------------
// BUSINESS RULE: Download settings structure
// -------------------------------------------------------------------

export type DownloadAllowedFor = 'clients' | 'guests' | 'both';

export interface IndividualDownloadSettings {
    enabled: boolean;
    allowedFor: DownloadAllowedFor;
}

export interface BulkAllDownloadSettings {
    enabled: boolean;
    allowedFor: DownloadAllowedFor;
}

export interface BulkFavoritesDownloadSettings {
    enabled: boolean;
    allowedFor: DownloadAllowedFor;
    maxCount: number; // Fixed at 200 for v1
}

export interface DownloadSettings {
    individual: IndividualDownloadSettings;
    bulkAll: BulkAllDownloadSettings;
    bulkFavorites: BulkFavoritesDownloadSettings;
}

// -------------------------------------------------------------------
// DEFAULTS - Backend ALWAYS merges stored JSON with these
// -------------------------------------------------------------------

export const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = {
    individual: { enabled: false, allowedFor: 'clients' },
    bulkAll: { enabled: false, allowedFor: 'clients' },
    bulkFavorites: { enabled: false, allowedFor: 'clients', maxCount: 200 }
};

// Maximum photos allowed in favorites download (v1 fixed limit)
export const MAX_FAVORITES_DOWNLOAD = 200;

// -------------------------------------------------------------------
// HELPER FUNCTIONS
// -------------------------------------------------------------------

/**
 * Merge stored JSON with defaults to fill missing/partial keys.
 * Never assume keys exist in stored JSON.
 */
export function getEffectiveDownloads(stored: Partial<DownloadSettings> | null): DownloadSettings {
    if (!stored) return DEFAULT_DOWNLOAD_SETTINGS;

    return {
        individual: {
            ...DEFAULT_DOWNLOAD_SETTINGS.individual,
            ...(stored.individual || {})
        },
        bulkAll: {
            ...DEFAULT_DOWNLOAD_SETTINGS.bulkAll,
            ...(stored.bulkAll || {})
        },
        bulkFavorites: {
            ...DEFAULT_DOWNLOAD_SETTINGS.bulkFavorites,
            ...(stored.bulkFavorites || {}),
            // Always enforce maxCount from server, never trust stored value
            maxCount: MAX_FAVORITES_DOWNLOAD
        }
    };
}

/**
 * Sanitize download settings for client responses.
 * Strips maxCount - clients only see whether favorites is allowed, not the limit.
 */
export function sanitizeDownloadsForClient(downloads: DownloadSettings): {
    individual: IndividualDownloadSettings;
    bulkAll: BulkAllDownloadSettings;
    bulkFavorites: Omit<BulkFavoritesDownloadSettings, 'maxCount'>;
} {
    return {
        individual: downloads.individual,
        bulkAll: downloads.bulkAll,
        bulkFavorites: {
            enabled: downloads.bulkFavorites.enabled,
            allowedFor: downloads.bulkFavorites.allowedFor
            // maxCount intentionally omitted - backend enforces silently
        }
    };
}

/**
 * Check if a specific download type is allowed for a given user role.
 * 
 * PERMISSION: This is the core enforcement function.
 */
export function checkDownloadAllowed(
    downloads: DownloadSettings,
    type: 'individual' | 'bulkAll' | 'bulkFavorites',
    userRole: 'primary_client' | 'guest'
): boolean {
    const setting = downloads[type];
    if (!setting.enabled) return false;
    if (setting.allowedFor === 'both') return true;
    if (setting.allowedFor === 'clients' && userRole === 'primary_client') return true;
    if (setting.allowedFor === 'guests' && userRole === 'guest') return true;
    return false;
}

// -------------------------------------------------------------------
// STRUCTURED ERROR CODES
// -------------------------------------------------------------------

export const DOWNLOAD_ERROR_CODES = {
    INDIVIDUAL_DOWNLOAD_DISABLED: 'INDIVIDUAL_DOWNLOAD_DISABLED',
    BULK_DOWNLOAD_NOT_ALLOWED: 'BULK_DOWNLOAD_NOT_ALLOWED',
    FAVORITES_LIMIT_EXCEEDED: 'FAVORITES_LIMIT_EXCEEDED',
} as const;

export type DownloadErrorCode = typeof DOWNLOAD_ERROR_CODES[keyof typeof DOWNLOAD_ERROR_CODES];
