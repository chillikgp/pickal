'use client';

import { useState, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Gallery, Section, Photo } from '@/lib/api';

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
    onDownloadAll?: () => void;
    isDownloading?: boolean;
    canDownload: boolean;
    canSelect: boolean;
    totalPhotoCount?: number; // P2: Total count for "All" tab
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

const MoreIcon = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
    </svg>
);

const ChevronDownIcon = () => (
    <svg className="w-3 h-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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
    isDownloading = false,
    canDownload,
    canSelect,
    totalPhotoCount = 0,
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

                        {/* Download All */}
                        {canDownload && (
                            <button
                                onClick={onDownloadAll}
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
                            </button>
                        )}

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

                            {/* Download */}
                            {canDownload && (
                                <button
                                    onClick={onDownloadAll}
                                    disabled={isDownloading}
                                    className={`p-2 rounded-md transition-colors ${isDownloading
                                        ? 'text-gray-400 cursor-not-allowed'
                                        : 'text-gray-600 hover:bg-gray-100'
                                        }`}
                                    title={isDownloading ? 'Downloading...' : 'Download All'}
                                >
                                    <DownloadIcon />
                                </button>
                            )}

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
