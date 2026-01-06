'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Gallery, Photographer } from '@/lib/api';

interface GalleryShareModalProps {
    gallery: Gallery;
    photographer: Photographer | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// Icons
const CopyIcon = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

const WhatsAppIcon = () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.884-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
);

const ExternalLinkIcon = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
);

type UrlType = 'custom' | 'short' | 'default';

export function GalleryShareModal({ gallery, photographer, open, onOpenChange }: GalleryShareModalProps) {
    const [urlType, setUrlType] = useState<UrlType>('default');
    const [includeCode, setIncludeCode] = useState(true);

    // Initialize state when opening
    useEffect(() => {
        if (open) {
            // Restore preference from localStorage
            const storedUrlType = localStorage.getItem('share_url_preference') as UrlType | null;
            const storedIncludeCode = localStorage.getItem('share_mode_preference');

            // Determine best available URL type
            let bestType: UrlType = 'default';
            if (photographer?.customDomain) {
                bestType = 'custom';
            } else if (gallery.customSlug) {
                bestType = 'short';
            }

            // Use stored preference if valid, otherwise best available
            if (storedUrlType === 'custom' && photographer?.customDomain) {
                setUrlType('custom');
            } else if (storedUrlType === 'short' && gallery.customSlug) {
                setUrlType('short');
            } else {
                setUrlType(bestType);
            }

            // Restore code toggle preference if available
            if (storedIncludeCode !== null) {
                setIncludeCode(storedIncludeCode === 'true');
            } else {
                // Default to true if access code exists
                setIncludeCode(!!gallery.customPassword);
            }
        }
    }, [open, gallery, photographer]);

    // Construct URL based on type
    const getUrl = (type: UrlType) => {
        const id = gallery.customSlug || gallery.id;
        const validId = gallery.id;

        switch (type) {
            case 'custom':
                if (photographer?.customDomain) {
                    return `https://${photographer.customDomain}/g/${id}`;
                }
                return `https://pickal-tan.vercel.app/g/${validId}`; // Fallback

            case 'short':
                if (gallery.customSlug) {
                    if (photographer?.studioSlug) {
                        return `https://pickal-tan.vercel.app/${photographer.studioSlug}/g/${gallery.customSlug}`;
                    }
                    return `https://pickal-tan.vercel.app/g/${gallery.customSlug}`;
                }
                return `https://pickal-tan.vercel.app/g/${validId}`; // Fallback

            case 'default':
            default:
                return `https://pickal-tan.vercel.app/g/${validId}`;
        }
    };

    const currentUrl = getUrl(urlType);
    const accessCode = gallery.customPassword;
    const hasAccessCode = !!accessCode;
    const showCode = hasAccessCode && includeCode;

    // Generate share text
    const getShareText = () => {
        if (showCode) {
            return `View your photos:\n${currentUrl}\n\nAccess Code: ${accessCode}`;
        }
        return `View your photos:\n${currentUrl}`;
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(getShareText());
        toast.success(showCode ? 'Link and access code copied!' : 'Link copied!');

        // Save preferences
        localStorage.setItem('share_url_preference', urlType);
        localStorage.setItem('share_mode_preference', String(includeCode));
    };

    const handleWhatsApp = () => {
        const text = showCode
            ? `Hi! Please find your photo gallery below:\n${currentUrl}\nAccess Code: ${accessCode}`
            : `Hi! Please find your photo gallery below:\n${currentUrl}`;

        const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');

        // Save preferences
        localStorage.setItem('share_url_preference', urlType);
        localStorage.setItem('share_mode_preference', String(includeCode));
    };

    // Determine available options
    const hasCustomDomain = !!photographer?.customDomain;
    const hasShortLink = !!gallery.customSlug;

    // Display helper to truncate middle of long URLs if needed
    const formatDisplayUrl = (url: string) => {
        if (url.length < 50) return url;
        const start = url.substring(0, 30);
        const end = url.substring(url.length - 10);
        return `${start}...${end}`;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md w-full max-w-full overflow-hidden">
                <DialogHeader>
                    <DialogTitle>Share Gallery</DialogTitle>
                    <p className="text-sm text-muted-foreground mt-1.5">
                        Share this gallery with friends & family using the link below.
                    </p>
                </DialogHeader>

                <div className="space-y-6 py-4 w-full">
                    {/* Link Selector */}
                    <div className="space-y-3">
                        <Label>Gallery Link</Label>
                        {(hasCustomDomain || hasShortLink) ? (
                            <Select value={urlType} onValueChange={(v) => setUrlType(v as UrlType)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {hasCustomDomain && (
                                        <SelectItem value="custom">
                                            Custom Domain (Recommended)
                                        </SelectItem>
                                    )}
                                    {hasShortLink && (
                                        <SelectItem value="short">
                                            Short Link
                                        </SelectItem>
                                    )}
                                    <SelectItem value="default">
                                        Default Link
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        ) : (
                            // Only default link available - show readonly input instead of dropdown
                            <div className="flex px-3 py-2 border rounded-md bg-muted/50 text-sm text-muted-foreground items-center justify-between w-full min-w-0">
                                <span className="truncate block flex-1 min-w-0">{currentUrl}</span>
                            </div>
                        )}
                    </div>

                    {/* Access Mode Toggle */}
                    {hasAccessCode && (
                        <div className="space-y-3">
                            <Label>Access Mode</Label>
                            <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg">
                                <button
                                    onClick={() => setIncludeCode(false)}
                                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${!includeCode
                                        ? 'bg-background shadow-sm text-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                >
                                    Link only
                                </button>
                                <button
                                    onClick={() => setIncludeCode(true)}
                                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${includeCode
                                        ? 'bg-background shadow-sm text-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                >
                                    Link + Access Code
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Preview Block */}
                    <div className="bg-muted/30 border rounded-lg p-4 space-y-3 w-full max-w-full overflow-hidden">
                        <div className="w-full min-w-0">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Gallery Link
                            </span>
                            <div className="flex items-center gap-2 mt-1 w-full min-w-0">
                                <a
                                    href={currentUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-medium text-blue-600 hover:underline truncate block flex-1 min-w-0"
                                    title={currentUrl}
                                >
                                    {formatDisplayUrl(currentUrl)}
                                </a>
                                <div className="shrink-0">
                                    <ExternalLinkIcon />
                                </div>
                            </div>
                        </div>

                        {showCode && (
                            <div>
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    Access Code
                                </span>
                                <div className="mt-1">
                                    <Badge variant="secondary" className="font-mono text-sm tracking-wide">
                                        {accessCode}
                                    </Badge>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    <Button
                        variant="outline"
                        onClick={handleCopy}
                        className="w-full sm:w-auto flex-1 gap-2"
                    >
                        <CopyIcon />
                        Copy
                    </Button>
                    <Button
                        onClick={handleWhatsApp}
                        className="w-full sm:w-auto flex-1 gap-2 bg-[#25D366] hover:bg-[#20BD5A] text-white"
                    >
                        <WhatsAppIcon />
                        WhatsApp
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
