/**
 * Next.js Middleware for Custom Domain Resolution
 * 
 * Handles custom domains like: gallery.mybabypictures.in/g/baby-ivaan
 * 
 * The middleware:
 * 1. Detects if the request is from a custom domain (not Vercel or localhost)
 * 2. Adds the host to query params for the resolver API to use
 * 3. For gallery routes, rewrites to include the host info
 * 
 * This allows custom domains to work without wildcard subdomains.
 */

import { NextResponse, type NextRequest } from 'next/server';

// Domains that are NOT custom domains (our own infrastructure)
const KNOWN_DOMAINS = [
    'localhost',
    'vercel.app',
    'pickal-tan.vercel.app',
];

function isKnownDomain(host: string): boolean {
    return KNOWN_DOMAINS.some(domain =>
        host === domain || host.endsWith(`.${domain}`) || host.includes('localhost')
    );
}

export function middleware(request: NextRequest) {
    const host = request.headers.get('host') || '';
    const { pathname } = request.nextUrl;

    // Skip if this is a known domain (not a custom domain)
    if (isKnownDomain(host)) {
        return NextResponse.next();
    }

    // Skip API routes, static files, and dashboard
    if (
        pathname.startsWith('/api') ||
        pathname.startsWith('/_next') ||
        pathname.startsWith('/dashboard') ||
        pathname.startsWith('/login') ||
        pathname.startsWith('/register') ||
        pathname.includes('.')
    ) {
        return NextResponse.next();
    }

    // For gallery routes on custom domains: /g/gallery-slug
    // The custom domain IS the studio, so we need to resolve via domain
    if (pathname.startsWith('/g/')) {
        // Add custom domain info to the response headers for client-side use
        const response = NextResponse.next();
        response.headers.set('x-custom-domain', host);
        return response;
    }

    // For root path on custom domain, could redirect to a landing page
    // or show a studio homepage (future feature)
    if (pathname === '/') {
        const response = NextResponse.next();
        response.headers.set('x-custom-domain', host);
        return response;
    }

    return NextResponse.next();
}

// Configure which paths the middleware runs on
export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public files (public folder)
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\..*|api).*)',
    ],
};
