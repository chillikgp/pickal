/**
 * Canonical URL Utilities
 * 
 * Generates the canonical (preferred) URL for galleries based on:
 * 1. Custom domain (if configured)
 * 2. Studio slug (if configured) 
 * 3. Legacy UUID fallback
 * 
 * Used for:
 * - Share URLs
 * - OG meta tags
 * - Canonical link tags
 */

import { Gallery, Photographer } from './api';

const BASE_URL = 'https://pickal-tan.vercel.app';

export interface CanonicalUrlOptions {
    gallery: Pick<Gallery, 'id' | 'customSlug'>;
    photographer?: Pick<Photographer, 'studioSlug' | 'customDomain'> | null;
    includeAccessPath?: boolean;
}

/**
 * Get the canonical URL for a gallery.
 * Priority: customDomain > studioSlug > UUID
 */
export function getCanonicalGalleryUrl(options: CanonicalUrlOptions): string {
    const { gallery, photographer, includeAccessPath = false } = options;
    const galleryIdentifier = gallery.customSlug || gallery.id;
    const accessSuffix = includeAccessPath ? '/access' : '';

    // Priority 1: Custom domain
    if (photographer?.customDomain) {
        return `https://${photographer.customDomain}/g/${galleryIdentifier}${accessSuffix}`;
    }

    // Priority 2: Studio slug path
    if (photographer?.studioSlug) {
        return `${BASE_URL}/${photographer.studioSlug}/g/${galleryIdentifier}${accessSuffix}`;
    }

    // Priority 3: Legacy UUID route
    return `${BASE_URL}/g/${gallery.id}${accessSuffix}`;
}

/**
 * Get display-friendly URL (shortened for UI display)
 */
export function getDisplayUrl(options: CanonicalUrlOptions): string {
    const { gallery, photographer } = options;
    const galleryIdentifier = gallery.customSlug || gallery.id.slice(0, 8) + '...';

    if (photographer?.customDomain) {
        return `${photographer.customDomain}/g/${galleryIdentifier}`;
    }

    if (photographer?.studioSlug) {
        return `pickal-tan.vercel.app/${photographer.studioSlug}/g/${galleryIdentifier}`;
    }

    return `pickal-tan.vercel.app/g/${galleryIdentifier}`;
}

/**
 * Build share text with URL and access code
 */
export function buildShareText(options: CanonicalUrlOptions & { accessCode?: string }): string {
    const { accessCode } = options;
    const url = getCanonicalGalleryUrl({ ...options, includeAccessPath: true });

    if (accessCode) {
        return `View your photos:\n${url}\n\nAccess Code: ${accessCode}`;
    }

    return `View your photos:\n${url}`;
}

/**
 * Build WhatsApp share URL
 */
export function getWhatsAppShareUrl(text: string, phoneNumber?: string): string {
    const encodedText = encodeURIComponent(text);

    if (phoneNumber) {
        // Clean phone number (remove spaces, dashes, etc.)
        const cleanNumber = phoneNumber.replace(/[^\d]/g, '');
        return `https://wa.me/${cleanNumber}?text=${encodedText}`;
    }

    return `https://wa.me/?text=${encodedText}`;
}
