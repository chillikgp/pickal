/**
 * Custom Domain Detection Utilities
 * 
 * Detects when the app is being accessed via a custom domain
 * and provides the normalized host for resolver calls.
 */

// Known platform domains (NOT custom domains)
const PLATFORM_DOMAINS = [
    'localhost',
    'vercel.app',
    'pickal-tan.vercel.app',
];

/**
 * Check if the current host is a custom domain (not platform domain)
 */
export function isCustomDomain(host?: string): boolean {
    if (typeof window === 'undefined' && !host) return false;

    const currentHost = host || (typeof window !== 'undefined' ? window.location.host : '');
    if (!currentHost) return false;

    // Strip port if present
    const hostname = currentHost.split(':')[0].toLowerCase();

    return !PLATFORM_DOMAINS.some(domain =>
        hostname === domain ||
        hostname.endsWith(`.${domain}`) ||
        hostname.includes('localhost')
    );
}

/**
 * Get the normalized hostname for API calls
 */
export function getNormalizedHost(): string | undefined {
    if (typeof window === 'undefined') return undefined;

    const host = window.location.host;
    if (!host) return undefined;

    // Strip port and lowercase
    return host.split(':')[0].toLowerCase();
}

/**
 * Check if a string looks like a UUID
 */
export function isUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}
