'use client';

/**
 * Studio Slug Gallery Access Route
 * 
 * Handles URLs like: /mybabypictures/g/baby-ivaan/access
 * Resolves studioSlug + gallerySlug to actual gallery ID and redirects to access page.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { studioApi } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';

export default function StudioGalleryAccessPage() {
    const params = useParams();
    const router = useRouter();
    const studioSlug = params.studioSlug as string;
    const gallerySlug = params.gallerySlug as string;

    const [error, setError] = useState<string | null>(null);
    const [resolving, setResolving] = useState(true);

    useEffect(() => {
        async function resolve() {
            try {
                const host = typeof window !== 'undefined' ? window.location.host : undefined;

                const result = await studioApi.resolve({
                    host,
                    studioSlug,
                    gallerySlug,
                });

                if (result.gallery) {
                    // Redirect to legacy access route with resolved gallery ID
                    router.replace(`/g/${result.gallery.id}/access`);
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

    if (resolving) {
        return (
            <main className="min-h-screen bg-white">
                <div className="h-screen flex flex-col items-center justify-center gap-4 px-4">
                    <Skeleton className="w-32 h-32 rounded-full" />
                    <Skeleton className="w-48 h-6" />
                    <p className="text-sm text-gray-400 mt-4">Loading...</p>
                </div>
            </main>
        );
    }

    if (error) {
        return (
            <main className="min-h-screen bg-white">
                <div className="h-screen flex flex-col items-center justify-center gap-4 px-4">
                    <div className="text-6xl">📷</div>
                    <h1 className="text-2xl font-semibold text-gray-900">Gallery Not Found</h1>
                    <p className="text-gray-500 text-center max-w-md">
                        We couldn't find this gallery. Please check the URL and try again.
                    </p>
                </div>
            </main>
        );
    }

    return null;
}
