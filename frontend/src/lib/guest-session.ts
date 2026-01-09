/**
 * Guest Session Management
 * 
 * Manages per-gallery browser session tokens for selfie reuse
 * when mobile number is not provided or not required.
 */

/**
 * Get or create a stable guest session token for a gallery.
 * This token persists across browser sessions and is used for:
 * - Rate limiting identification
 * - Selfie mapping reuse when mobile is absent
 */
export function getGuestSessionToken(galleryId: string): string {
    if (typeof window === 'undefined') return '';

    const key = `pickal:guest:${galleryId}:token`;
    let token = localStorage.getItem(key);

    if (!token) {
        token = crypto.randomUUID();
        localStorage.setItem(key, token);
    }

    return token;
}

/**
 * Get stored mobile number for a gallery (if previously entered)
 */
export function getStoredMobile(galleryId: string): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(`pickal:guest:${galleryId}:mobile`);
}

/**
 * Store mobile number for future reuse
 */
export function setStoredMobile(galleryId: string, mobile: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(`pickal:guest:${galleryId}:mobile`, mobile);
}

/**
 * Clear stored mobile (used when "Change selfie" is clicked)
 */
export function clearStoredMobile(galleryId: string): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(`pickal:guest:${galleryId}:mobile`);
}
