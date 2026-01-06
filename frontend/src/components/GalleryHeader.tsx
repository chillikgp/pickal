'use client';

import { useState, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Gallery, Section, Photo, DownloadSettings, DEFAULT_DOWNLOAD_SETTINGS } from '@/lib/api';

// DOWNLOAD_CONTROLS_V1: Extended props for download controls
interface GalleryHeaderProps {
    gallery: Gallery;
    sections: Section[];
    photos: Photo[];
    activeSection: string;
    setActiveSection: (section: string) => void;
    selectedIds: Set<string>;
    showFavoritesOnly: boolean;
    setShowFavoritesOnly: (val: boolean) => void;
    onStartSlideshow: () => void;
    // DOWNLOAD_CONTROLS_V1: Enhanced download props
    onDownloadAll?: () => void;
    onDownloadFavorites?: (photoIds: string[]) => void;
    isDownloading?: boolean;
    canDownloadIndividual: boolean; // NEW: For disabled state variant detection
    canDownloadBulkAll: boolean;
    canDownloadBulkFavorites: boolean;
    downloadResolution: 'web' | 'original';
    canSelect: boolean;
    totalPhotoCount?: number;
    // DOWNLOAD_CONTROLS_V1: For disabled state CTA
    studioWhatsappNumber?: string | null;
    gallerySlug?: string;
}

// Icons as inline SVGs for cleaner code
const PlayIcon = () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z" />
    </svg>
);

const DownloadIcon = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
);

const HeartIcon = ({ filled = false }: { filled?: boolean }) => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
);

const ChevronDownIcon = () => (
    <svg className="w-3 h-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
);

const WhatsAppIcon = () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
);

export function GalleryHeader({
    gallery,
    sections,
    photos,
    activeSection,
    setActiveSection,
    selectedIds,
    showFavoritesOnly,
    setShowFavoritesOnly,
    onStartSlideshow,
    onDownloadAll,
    onDownloadFavorites,
    isDownloading = false,
    canDownloadIndividual,
    canDownloadBulkAll,
    canDownloadBulkFavorites,
    downloadResolution,
    canSelect,
    totalPhotoCount = 0,
    studioWhatsappNumber,
    gallerySlug,
}: GalleryHeaderProps) {
    const [isSticky, setIsSticky] = useState(false);
    const headerRef = useRef<HTMLDivElement>(null);

    // Track scroll for sticky header effect
    useEffect(() => {
        const handleScroll = () => {
            if (headerRef.current) {
                const rect = headerRef.current.getBoundingClientRect();
                setIsSticky(rect.top <= 0);
            }
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Get photo count for a section
    const getPhotoCount = (sectionId: string | 'all') => {
        if (sectionId === 'all') return totalPhotoCount || gallery._count?.photos || 0;
        const section = sections.find(s => s.id === sectionId);
        return section?._count?.photos || 0;
    };

    // Determine how many sections to show inline (desktop only)
    const MAX_INLINE_SECTIONS = 4;
    const inlineSections = sections.slice(0, MAX_INLINE_SECTIONS);
    const overflowSections = sections.slice(MAX_INLINE_SECTIONS);

    // Check if current active section is in overflow
    const activeInOverflow = overflowSections.some(s => s.id === activeSection);
    const activeSectionName = sections.find(s => s.id === activeSection)?.name;

    // DOWNLOAD_CONTROLS_V1: Compute download availability
    const hasAnyDownloadOption = canDownloadBulkAll || canDownloadBulkFavorites;
    const favoritesCount = selectedIds.size;
    const canDownloadFavoritesNow = canDownloadBulkFavorites && favoritesCount > 0;

    // DOWNLOAD_CONTROLS_V1: Quality display text
    const qualityText = downloadResolution === 'original' ? 'Original quality' : 'Web quality (1920px)';

    // DOWNLOAD_CONTROLS_V1: WhatsApp contact link with variant-specific messages
    const getWhatsAppLink = (forBulk: boolean = false) => {
        if (!studioWhatsappNumber) return null;
        const message = forBulk
            ? encodeURIComponent(
                `Hi! I'm viewing the gallery "${gallerySlug || gallery.name}" and would like to request bulk download access.`
            )
            : encodeURIComponent(
                `Hi! I'm viewing the gallery "${gallerySlug || gallery.name}" and would like to request download access.`
            );
        // Clean the phone number (remove spaces, dashes, etc.)
        const cleanNumber = studioWhatsappNumber.replace(/[^0-9+]/g, '');
        return `https://wa.me/${cleanNumber}?text=${message}`;
    };

    const whatsappLink = getWhatsAppLink();
    const whatsappLinkBulk = getWhatsAppLink(true);

    // DOWNLOAD_CONTROLS_V1: Handle download favorites click
    const handleDownloadFavorites = () => {
        if (onDownloadFavorites && favoritesCount > 0) {
            onDownloadFavorites(Array.from(selectedIds));
        }
    };

    // DOWNLOAD_CONTROLS_V1: Render download button/dropdown
    const renderDownloadButton = () => {
        // No bulk download options available - show disabled state with contact CTA
        if (!hasAnyDownloadOption) {
            // VARIANT A: Bulk disabled, individual allowed
            if (canDownloadIndividual) {
                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 rounded-md cursor-pointer"
                            >
                                <DownloadIcon />
                                <span className="hidden lg:inline">Download All</span>
                                <ChevronDownIcon />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-80">
                            <div className="p-4">
                                <p className="text-sm font-medium text-gray-900 mb-2">
                                    Bulk download is not enabled
                                </p>
                                <p className="text-sm text-gray-600 mb-4">
                                    You can download individual photos from this gallery.
                                    If you'd like to download everything at once, please contact the photographer.
                                </p>
                                {whatsappLinkBulk && (
                                    <a
                                        href={whatsappLinkBulk}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-[#25D366] hover:bg-[#20BD5A] text-white text-sm font-medium rounded-lg transition-colors"
                                    >
                                        <WhatsAppIcon />
                                        Contact Photographer
                                    </a>
                                )}
                            </div>
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            }

            // VARIANT B: All downloads disabled
            return (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 rounded-md cursor-pointer"
                        >
                            <DownloadIcon />
                            <span className="hidden lg:inline">Download All</span>
                            <ChevronDownIcon />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-80">
                        <div className="p-4">
                            <p className="text-sm font-medium text-gray-900 mb-2">
                                Downloads are not enabled for this gallery
                            </p>
                            <p className="text-sm text-gray-600 mb-4">
                                Photo downloads are currently disabled.
                                Please contact the photographer if you need access.
                            </p>
                            {whatsappLink && (
                                <a
                                    href={whatsappLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#25D366] hover:bg-[#20BD5A] text-white text-sm font-medium rounded-lg transition-colors"
                                >
                                    <WhatsAppIcon />
                                    Contact Photographer
                                </a>
                            )}
                        </div>
                    </DropdownMenuContent>
                </DropdownMenu>
            );
        }

        // Has download options - show dropdown with available options
        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        disabled={isDownloading}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${isDownloading
                            ? 'text-gray-400 cursor-not-allowed'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                            }`}
                    >
                        <DownloadIcon />
                        <span className="hidden lg:inline">
                            {isDownloading ? 'Downloading...' : 'Download'}
                        </span>
                        <ChevronDownIcon />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                    {/* Download All option */}
                    {canDownloadBulkAll && (
                        <DropdownMenuItem
                            onClick={onDownloadAll}
                            disabled={isDownloading}
                            className="cursor-pointer"
                        >
                            <div className="flex items-center justify-between w-full">
                                <span>Download All</span>
                                <span className="text-xs text-gray-500">
                                    ({totalPhotoCount} photos)
                                </span>
                            </div>
                        </DropdownMenuItem>
                    )}

                    {/* Download Favorites option */}
                    {canDownloadBulkFavorites && (
                        <DropdownMenuItem
                            onClick={handleDownloadFavorites}
                            disabled={isDownloading || favoritesCount === 0}
                            className={`cursor-pointer ${favoritesCount === 0 ? 'opacity-50' : ''}`}
                        >
                            <div className="flex items-center justify-between w-full">
                                <span className="flex items-center gap-1.5">
                                    <HeartIcon filled />
                                    Download Favorites
                                </span>
                                <span className="text-xs text-gray-500">
                                    ({favoritesCount} / 200)
                                </span>
                            </div>
                        </DropdownMenuItem>
                    )}

                    {/* Quality microcopy */}
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1.5">
                        <p className="text-xs text-gray-500">
                            Files will be downloaded in {qualityText}
                        </p>
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>
        );
    };

    // DOWNLOAD_CONTROLS_V1: Mobile download button with same logic
    const renderMobileDownloadButton = () => {
        if (!hasAnyDownloadOption) {
            // VARIANT A: Bulk disabled, individual allowed
            if (canDownloadIndividual) {
                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                className="p-2 text-gray-400 rounded-md"
                                title="Bulk download disabled"
                            >
                                <DownloadIcon />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-80">
                            <div className="p-4">
                                <p className="text-sm font-medium text-gray-900 mb-2">
                                    Bulk download is not enabled
                                </p>
                                <p className="text-sm text-gray-600 mb-4">
                                    You can download individual photos from this gallery.
                                    If you'd like to download everything at once, please contact the photographer.
                                </p>
                                {whatsappLinkBulk && (
                                    <a
                                        href={whatsappLinkBulk}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-[#25D366] hover:bg-[#20BD5A] text-white text-sm font-medium rounded-lg transition-colors"
                                    >
                                        <WhatsAppIcon />
                                        Contact Photographer
                                    </a>
                                )}
                            </div>
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            }

            // VARIANT B: All downloads disabled
            return (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            className="p-2 text-gray-400 rounded-md"
                            title="Downloads disabled"
                        >
                            <DownloadIcon />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-80">
                        <div className="p-4">
                            <p className="text-sm font-medium text-gray-900 mb-2">
                                Downloads are not enabled for this gallery
                            </p>
                            <p className="text-sm text-gray-600 mb-4">
                                Photo downloads are currently disabled.
                                Please contact the photographer if you need access.
                            </p>
                            {whatsappLink && (
                                <a
                                    href={whatsappLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#25D366] hover:bg-[#20BD5A] text-white text-sm font-medium rounded-lg transition-colors"
                                >
                                    <WhatsAppIcon />
                                    Contact Photographer
                                </a>
                            )}
                        </div>
                    </DropdownMenuContent>
                </DropdownMenu>
            );
        }

        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        disabled={isDownloading}
                        className={`p-2 rounded-md transition-colors ${isDownloading
                            ? 'text-gray-400 cursor-not-allowed'
                            : 'text-gray-600 hover:bg-gray-100'
                            }`}
                        title={isDownloading ? 'Downloading...' : 'Download'}
                    >
                        <DownloadIcon />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                    {canDownloadBulkAll && (
                        <DropdownMenuItem
                            onClick={onDownloadAll}
                            disabled={isDownloading}
                            className="cursor-pointer"
                        >
                            <div className="flex items-center justify-between w-full">
                                <span>Download All</span>
                                <span className="text-xs text-gray-500">
                                    ({totalPhotoCount} photos)
                                </span>
                            </div>
                        </DropdownMenuItem>
                    )}

                    {canDownloadBulkFavorites && (
                        <DropdownMenuItem
                            onClick={handleDownloadFavorites}
                            disabled={isDownloading || favoritesCount === 0}
                            className={`cursor-pointer ${favoritesCount === 0 ? 'opacity-50' : ''}`}
                        >
                            <div className="flex items-center justify-between w-full">
                                <span className="flex items-center gap-1.5">
                                    <HeartIcon filled />
                                    Favorites
                                </span>
                                <span className="text-xs text-gray-500">
                                    ({favoritesCount} / 200)
                                </span>
                            </div>
                        </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator />
                    <div className="px-2 py-1.5">
                        <p className="text-xs text-gray-500">
                            {qualityText}
                        </p>
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>
        );
    };

    return (
        <div
            ref={headerRef}
            className={`sticky top-0 z-40 bg-white border-b transition-shadow duration-200 ${isSticky ? 'shadow-sm' : ''
                }`}
        >
            <div className="container mx-auto px-4">
                {/* Desktop Layout */}
                <div className="hidden md:flex items-center justify-between py-4 gap-8">
                    {/* Left: Event Info */}
                    <div className="flex-shrink-0 min-w-0">
                        <h2 className="text-lg font-semibold text-gray-900 truncate">
                            {gallery.name}
                        </h2>
                        {gallery.description && (
                            <p className="text-sm text-gray-500 truncate max-w-xs">
                                {gallery.description}
                            </p>
                        )}
                    </div>

                    {/* Section Tabs - Left aligned */}
                    <div className="flex items-center gap-1 flex-1">
                        {/* All Photos */}
                        <button
                            onClick={() => setActiveSection('all')}
                            className={`px-3 py-1.5 text-sm font-medium transition-colors rounded-md whitespace-nowrap ${activeSection === 'all'
                                ? 'text-gray-900 bg-gray-100'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                        >
                            All Photos
                            <span className="ml-1 text-xs text-gray-400">({getPhotoCount('all')})</span>
                        </button>

                        {/* Inline Sections */}
                        {inlineSections.map(section => (
                            <button
                                key={section.id}
                                onClick={() => setActiveSection(section.id)}
                                className={`px-3 py-1.5 text-sm font-medium transition-colors rounded-md whitespace-nowrap ${activeSection === section.id
                                    ? 'text-gray-900 bg-gray-100'
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                    }`}
                            >
                                {section.name}
                                <span className="ml-1 text-xs text-gray-400">({getPhotoCount(section.id)})</span>
                            </button>
                        ))}

                        {/* More Dropdown (if overflow exists) */}
                        {overflowSections.length > 0 && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button
                                        className={`flex items-center px-3 py-1.5 text-sm font-medium transition-colors rounded-md ${activeInOverflow
                                            ? 'text-gray-900 bg-gray-100'
                                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                            }`}
                                    >
                                        {activeInOverflow ? activeSectionName : 'More'}
                                        <ChevronDownIcon />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="center">
                                    {overflowSections.map(section => (
                                        <DropdownMenuItem
                                            key={section.id}
                                            onClick={() => setActiveSection(section.id)}
                                            className="cursor-pointer"
                                        >
                                            <span className={activeSection === section.id ? 'font-medium' : ''}>
                                                {section.name}
                                            </span>
                                            <span className="ml-2 text-xs text-gray-400">
                                                ({getPhotoCount(section.id)})
                                            </span>
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>

                    {/* Right: CTAs */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Slideshow */}
                        {photos.length > 0 && (
                            <button
                                onClick={onStartSlideshow}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                            >
                                <PlayIcon />
                                <span className="hidden lg:inline">Slideshow</span>
                            </button>
                        )}

                        {/* DOWNLOAD_CONTROLS_V1: Download Dropdown (replaces single button) */}
                        {renderDownloadButton()}

                        {/* Favorites */}
                        {canSelect && (
                            <button
                                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${showFavoritesOnly
                                    ? 'bg-rose-50 text-rose-600'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                    }`}
                            >
                                <HeartIcon filled={showFavoritesOnly} />
                                {selectedIds.size > 0 && (
                                    <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                                        {selectedIds.size}
                                    </Badge>
                                )}
                            </button>
                        )}
                    </div>
                </div>

                {/* Mobile Layout */}
                <div className="md:hidden">
                    {/* Top Row: Event Info + Actions */}
                    <div className="flex items-center justify-between py-3">
                        <div className="min-w-0 flex-1">
                            <h2 className="text-base font-semibold text-gray-900 truncate">
                                {gallery.name}
                            </h2>
                            {gallery.description && (
                                <p className="text-xs text-gray-500 truncate">
                                    {gallery.description}
                                </p>
                            )}
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                            {/* Slideshow */}
                            {photos.length > 0 && (
                                <button
                                    onClick={onStartSlideshow}
                                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                                    title="Slideshow"
                                >
                                    <PlayIcon />
                                </button>
                            )}

                            {/* DOWNLOAD_CONTROLS_V1: Mobile Download Dropdown */}
                            {renderMobileDownloadButton()}

                            {/* Favorites */}
                            {canSelect && (
                                <button
                                    onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                                    className={`p-2 rounded-md transition-colors ${showFavoritesOnly
                                        ? 'bg-rose-50 text-rose-600'
                                        : 'text-gray-600 hover:bg-gray-100'
                                        }`}
                                    title="Favorites"
                                >
                                    <HeartIcon filled={showFavoritesOnly} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Bottom Row: Section Tabs (Scrollable) */}
                    {sections.length > 0 && (
                        <div className="flex items-center gap-4 overflow-x-auto pb-3 -mx-4 px-4 scrollbar-hide">
                            <button
                                onClick={() => setActiveSection('all')}
                                className={`flex-shrink-0 px-3 py-1 text-sm font-medium rounded-md transition-colors ${activeSection === 'all'
                                    ? 'text-gray-900 bg-gray-100'
                                    : 'text-gray-500'
                                    }`}
                            >
                                All Photos
                                <span className="ml-1 text-xs text-gray-400">({getPhotoCount('all')})</span>
                            </button>
                            {sections.map(section => (
                                <button
                                    key={section.id}
                                    onClick={() => setActiveSection(section.id)}
                                    className={`flex-shrink-0 px-3 py-1 text-sm font-medium whitespace-nowrap rounded-md transition-colors ${activeSection === section.id
                                        ? 'text-gray-900 bg-gray-100'
                                        : 'text-gray-500'
                                        }`}
                                >
                                    {section.name}
                                    <span className="ml-1 text-xs text-gray-400">({getPhotoCount(section.id)})</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
