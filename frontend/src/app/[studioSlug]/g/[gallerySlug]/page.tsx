'use client';

/**
 * Studio Slug Gallery Route
 * 
 * Handles URLs like: /mybabypictures/g/baby-ivaan
 * Resolves studioSlug + gallerySlug to actual gallery ID and renders the gallery.
 * 
 * This is a wrapper that:
 * 1. Extracts studioSlug and gallerySlug from URL
 * 2. Calls the resolver API to get the gallery ID
 * 3. Redirects to the legacy /g/[id] route with resolved ID
 * 
 * This approach reuses the existing gallery page component without duplication.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter, notFound } from 'next/navigation';
import { studioApi } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';

export default function StudioGalleryPage() {
    const params = useParams();
    const router = useRouter();
    const studioSlug = params.studioSlug as string;
    const gallerySlug = params.gallerySlug as string;

    const [error, setError] = useState<string | null>(null);
    const [resolving, setResolving] = useState(true);

    useEffect(() => {
        async function resolve() {
            try {
                // Get host for custom domain detection
                const host = typeof window !== 'undefined' ? window.location.host : undefined;

                const result = await studioApi.resolve({
                    host,
                    studioSlug,
                    gallerySlug,
                });

                if (result.gallery) {
                    // Redirect to legacy route with resolved gallery ID
                    // This reuses the existing gallery page component
                    router.replace(`/g/${result.gallery.id}`);
                } else {
                    setError('Gallery not found');
                    setResolving(false);
                }
            } catch (err) {
                console.error('Failed to resolve gallery:', err);
                setError('Gallery not found');
                setResolving(false);
            }
        }

        if (studioSlug && gallerySlug) {
            resolve();
        }
    }, [studioSlug, gallerySlug, router]);

    // Show loading state while resolving
    if (resolving) {
        return (
            <main className="min-h-screen bg-white">
                <div className="h-screen flex flex-col items-center justify-center gap-4 px-4">
                    <Skeleton className="w-32 h-32 rounded-full" />
                    <Skeleton className="w-48 h-6" />
                    <Skeleton className="w-64 h-4" />
                    <p className="text-sm text-gray-400 mt-4">Loading gallery...</p>
                </div>
            </main>
        );
    }

    // Show error state
    if (error) {
        return (
            <main className="min-h-screen bg-white">
                <div className="h-screen flex flex-col items-center justify-center gap-4 px-4">
                    <div className="text-6xl">📷</div>
                    <h1 className="text-2xl font-semibold text-gray-900">Gallery Not Found</h1>
                    <p className="text-gray-500 text-center max-w-md">
                        We couldn't find a gallery at <strong>{studioSlug}/g/{gallerySlug}</strong>.
                        Please check the URL and try again.
                    </p>
                </div>
            </main>
        );
    }

    return null;
}
