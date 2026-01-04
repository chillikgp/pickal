'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface StudioInfo {
    name: string;
    logoUrl: string | null;
    websiteUrl: string | null;
    reviewUrl: string | null;
    whatsappNumber: string | null;
}

interface GalleryNextStepsProps {
    galleryName: string;
    gallerySlug: string;
    accessCode?: string;
    studio: StudioInfo;
}

export function GalleryNextSteps({ galleryName, gallerySlug, accessCode, studio }: GalleryNextStepsProps) {
    const [shareModalOpen, setShareModalOpen] = useState(false);

    // Build gallery URL
    const galleryUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/g/${gallerySlug}`
        : `/g/${gallerySlug}`;

    // Format share message
    const friendlyMessage = "Hi! Here are your photos 💛";
    const shareMessageContent = accessCode
        ? `${friendlyMessage}\n\nGallery link:\n${galleryUrl}\n\nAccess code:\n${accessCode}`
        : `${friendlyMessage}\n\nGallery link:\n${galleryUrl}`;

    // Copy to clipboard
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(shareMessageContent);
            toast.success('Copied to clipboard!');
        } catch {
            toast.error('Failed to copy');
        }
    };

    // WhatsApp share
    const handleWhatsAppShare = () => {
        const text = encodeURIComponent(shareMessageContent);
        window.open(`https://wa.me/?text=${text}`, '_blank');
    };

    // WhatsApp inquiry for prints
    const handlePrintsInquiry = () => {
        if (studio.whatsappNumber) {
            const message = encodeURIComponent(
                `Hi! We viewed our gallery and would like to know more about prints and albums 🙂`
            );
            window.open(`https://wa.me/${studio.whatsappNumber}?text=${message}`, '_blank');
        } else if (studio.websiteUrl) {
            window.open(studio.websiteUrl, '_blank');
        }
    };

    // Check which CTAs to show
    const showRecommendCta = !!studio.reviewUrl;
    const showPrintsCta = !!(studio.whatsappNumber || studio.websiteUrl);

    // If no CTAs are available except Share, still show section
    const hasAnyCta = true; // Share is always available

    if (!hasAnyCta) return null;

    return (
        <section className="py-16 px-6 border-t border-gray-100">
            <div className="max-w-4xl mx-auto text-center">
                {/* Headline */}
                <h2 className="text-2xl font-light text-gray-900 mb-3">
                    What's next?
                </h2>
                <p className="text-gray-500 text-sm mb-10 max-w-md mx-auto">
                    We hope you loved the memories. Here's how to continue the experience.
                </p>

                {/* CTAs Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-3xl mx-auto">
                    {/* Share Gallery */}
                    <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
                        <DialogTrigger asChild>
                            <button className="group flex flex-col items-center p-6 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-100">
                                <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center mb-4 group-hover:shadow-sm transition-shadow">
                                    <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                </div>
                                <h3 className="font-medium text-gray-900 mb-1">Share Gallery</h3>
                                <p className="text-xs text-gray-500 leading-relaxed">
                                    Send invitations to friends and family
                                </p>
                            </button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle>Share Gallery</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-6 py-4">
                                <p className="text-sm text-gray-500">
                                    Share this gallery with friends & family using the link and access code below.
                                </p>

                                <div className="space-y-4">
                                    {/* Link Section */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Gallery Link
                                        </label>
                                        <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-900 font-mono break-all border border-gray-100">
                                            {galleryUrl}
                                        </div>
                                    </div>

                                    {/* Code Section */}
                                    {accessCode && (
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Access Code
                                            </label>
                                            <div className="bg-rose-50 rounded-lg p-3 text-lg font-bold text-rose-600 font-mono tracking-wider border border-rose-100 w-fit">
                                                {accessCode}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <Button
                                        onClick={handleCopy}
                                        variant="outline"
                                        className="flex-1"
                                    >
                                        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                        Copy
                                    </Button>
                                    <Button
                                        onClick={handleWhatsAppShare}
                                        className="flex-1 bg-green-600 hover:bg-green-700"
                                    >
                                        <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                        </svg>
                                        Send via WhatsApp
                                    </Button>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>

                    {/* Recommend / Review */}
                    {showRecommendCta && (
                        <a
                            href={studio.reviewUrl!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex flex-col items-center p-6 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-100"
                        >
                            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center mb-4 group-hover:shadow-sm transition-shadow">
                                <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                </svg>
                            </div>
                            <h3 className="font-medium text-gray-900 mb-1">Recommend</h3>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Loved the photos? Leave a review
                            </p>
                        </a>
                    )}

                    {/* Prints & Albums */}
                    {showPrintsCta && (
                        <button
                            onClick={handlePrintsInquiry}
                            className="group flex flex-col items-center p-6 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-100"
                        >
                            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center mb-4 group-hover:shadow-sm transition-shadow">
                                <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                                </svg>
                            </div>
                            <h3 className="font-medium text-gray-900 mb-1">Prints & Albums</h3>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Inquire about prints, albums & more
                            </p>
                        </button>
                    )}
                </div>

                {/* Studio branding footer */}
                <div className="mt-12 pt-8 border-t border-gray-100">
                    <p className="text-xs text-gray-400">
                        {studio.websiteUrl ? (
                            <a
                                href={studio.websiteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-gray-600 transition-colors cursor-pointer hover:opacity-80"
                            >
                                Photos by {studio.name}
                            </a>
                        ) : (
                            <>Photos by {studio.name}</>
                        )}
                    </p>
                </div>
            </div>
        </section>
    );
}
