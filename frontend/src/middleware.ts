/**
 * Next.js Middleware for Custom Domain Resolution
 * 
 * Handles custom domains like: gallery.mybabypictures.in/g/baby-ivaan
 * 
 * The middleware:
 * 1. Detects if the request is from a custom domain (not Vercel or localhost)
 * 2. Blocks homepage on custom domains (shows "Gallery access only" page)
 * 3. Allows /g/* routes to proceed (resolution happens in page components)
 * 
 * This allows custom domains to work without wildcard subdomains.
 */

import { NextResponse, type NextRequest } from 'next/server';

// Domains that are NOT custom domains (our own infrastructure)
const PLATFORM_DOMAINS = [
    'localhost',
    'vercel.app',
    'pickal-tan.vercel.app',
];

function isCustomDomain(host: string): boolean {
    if (!host) return false;
    const hostname = host.split(':')[0].toLowerCase();
    return !PLATFORM_DOMAINS.some(domain =>
        hostname === domain ||
        hostname.endsWith(`.${domain}`) ||
        hostname.includes('localhost')
    );
}

export function middleware(request: NextRequest) {
    const host = request.headers.get('host') || '';
    const { pathname } = request.nextUrl;

    // Only process custom domains
    if (!isCustomDomain(host)) {
        return NextResponse.next();
    }

    // Skip API routes, static files, and internal routes
    if (
        pathname.startsWith('/api') ||
        pathname.startsWith('/_next') ||
        pathname.includes('.') ||
        pathname.startsWith('/favicon')
    ) {
        return NextResponse.next();
    }

    // On custom domains, ONLY allow /g/* routes
    // Everything else should show a "Gallery access only" message
    if (pathname.startsWith('/g/')) {
        // Gallery routes are allowed - proceed normally
        // Resolution happens in the page components using studioApi.resolve
        return NextResponse.next();
    }

    // Block homepage and other routes on custom domains
    // Redirect to a simple message page or return custom response
    if (pathname === '/' || pathname === '') {
        // Create a simple HTML response for invalid routes on custom domains
        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Gallery Access Only</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: #f9fafb;
            color: #374151;
        }
        .container {
            text-align: center;
            padding: 2rem;
        }
        .icon { font-size: 4rem; margin-bottom: 1rem; }
        h1 { font-size: 1.5rem; margin-bottom: 0.5rem; font-weight: 600; }
        p { color: #6b7280; margin-bottom: 1rem; }
        code { background: #e5e7eb; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.875rem; }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">📷</div>
        <h1>Gallery Access Only</h1>
        <p>This domain is configured for gallery access.</p>
        <p>Use a link in the format:</p>
        <code>${host}/g/your-gallery-slug</code>
    </div>
</body>
</html>
        `.trim();

        return new NextResponse(html, {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
        });
    }

    // Other paths on custom domain - return 404
    return new NextResponse('Not Found', { status: 404 });
}

// Configure which paths the middleware runs on
export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - api routes
         */
        '/((?!_next/static|_next/image|api).*)',
    ],
};
