'use client';

/**
 * Gallery Layout
 * 
 * P0-4: Prevent Google Indexing
 * Adds noindex/nofollow meta tags to all gallery routes.
 * This ensures private galleries are not indexed by search engines.
 */

import { useEffect } from 'react';

export default function GalleryLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // P0-4: Add noindex/nofollow meta tags dynamically for client-rendered pages
    useEffect(() => {
        // Check if meta tag already exists
        let robotsMeta = document.querySelector('meta[name="robots"]');

        if (!robotsMeta) {
            robotsMeta = document.createElement('meta');
            robotsMeta.setAttribute('name', 'robots');
            document.head.appendChild(robotsMeta);
        }

        robotsMeta.setAttribute('content', 'noindex, nofollow');

        // Cleanup on unmount
        return () => {
            if (robotsMeta && robotsMeta.parentNode) {
                robotsMeta.setAttribute('content', 'index, follow');
            }
        };
    }, []);

    return <>{children}</>;
}
