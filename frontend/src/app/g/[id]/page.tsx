'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { photoApi, galleryApi, selectionApi, commentApi, printApi, faceApi, setSessionToken, Photo, Gallery, Comment, getSessionToken } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { GalleryHeader } from '@/components/GalleryHeader';
import { GalleryNextSteps } from '@/components/GalleryNextSteps';

export default function ClientGalleryPage() {
    const params = useParams();
    const router = useRouter();
    const galleryId = params.id as string;

    const [gallery, setGallery] = useState<Gallery | null>(null);
    // Pagination State
    const [sectionData, setSectionData] = useState<Record<string, {
        photos: Photo[];
        nextCursor: string | null;
        isLoading: boolean;
        isInitialized: boolean;
    }>>({});
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
    const [activeSection, setActiveSection] = useState<string>('all');

    // Comments state
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);

    // Print request state
    const [showPrintDialog, setShowPrintDialog] = useState(false);
    const [printQuantity, setPrintQuantity] = useState(1);
    const [printSize, setPrintSize] = useState('');
    const [printNotes, setPrintNotes] = useState('');
    const [isSubmittingPrint, setIsSubmittingPrint] = useState(false);

    // Determine if user is primary client or guest
    const [isPrimaryClient, setIsPrimaryClient] = useState(true); // Default: primary client can do everything

    // Guest selfie state
    const [guestSelfiePreview, setGuestSelfiePreview] = useState<string | null>(null);
    const [showSelfieChange, setShowSelfieChange] = useState(false);
    const [newSelfieFile, setNewSelfieFile] = useState<File | null>(null);
    const [newSelfiePreview, setNewSelfiePreview] = useState<string | null>(null);
    const [isReMatchingSelfie, setIsReMatchingSelfie] = useState(false);
    const selfieInputRef = useRef<HTMLInputElement>(null);

    // Slideshow state
    const [slideshowActive, setSlideshowActive] = useState(false);
    const [slideshowIndex, setSlideshowIndex] = useState(0);
    const [slideshowPaused, setSlideshowPaused] = useState(false);
    const [slideshowLaunchedFrom, setSlideshowLaunchedFrom] = useState<'grid' | 'canvas'>('grid');
    const slideshowTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Favorites filter state
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

    // P0-5: Download all state
    const [isDownloading, setIsDownloading] = useState(false);

    // Ref for smooth scroll to gallery
    const galleryGridRef = useRef<HTMLDivElement>(null);
    const galleryStartRef = useRef<HTMLDivElement>(null); // Anchor for "Back to Top"

    const loadData = useCallback(async () => {
        const token = getSessionToken();
        if (!token) {
            router.push(`/g/${galleryId}/access`);
            return;
        }

        try {
            // Initial load gets Gallery info and First page of "All" photos
            const [galleryRes, photosRes, selectionsRes] = await Promise.all([
                galleryApi.get(galleryId, true),
                photoApi.getByGallery(galleryId, { limit: 50 }, true),
                selectionApi.getMy().catch(() => ({ selections: [] })),
            ]);

            setGallery(galleryRes.gallery);

            // Initialize 'all' section with first page
            setSectionData(prev => ({
                ...prev,
                'all': {
                    photos: photosRes.photos,
                    nextCursor: photosRes.nextCursor,
                    isLoading: false,
                    isInitialized: true
                }
            }));

            setSelectedIds(new Set(selectionsRes.selections.map(s => s.photoId)));

            // Check if this is a guest session
            // Guest detection now handled by selfie presence check in useEffect
            // so we don't override isPrimaryClient here
        } catch (error) {
            console.error('Failed to load gallery:', error);
            toast.error('Failed to load gallery');
            // router.push(`/g/${galleryId}/access`); // Don't redirect on error instantly, allows retry
        } finally {
            setIsLoading(false);
        }
    }, [galleryId, router]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // P2: Load data for a specific section (initial or next page)
    const loadSectionItems = useCallback(async (sectionId: string, cursor?: string | null) => {
        try {
            // Set loading state
            setSectionData(prev => ({
                ...prev,
                [sectionId]: {
                    ...(prev[sectionId] || { photos: [], nextCursor: null, isInitialized: false }),
                    isLoading: true,
                }
            }));

            const res = await photoApi.getByGallery(galleryId, {
                sectionId,
                cursor: cursor || undefined,
                limit: 50
            }, true);

            setSectionData(prev => {
                const existing = prev[sectionId] || { photos: [] };

                // Append if cursor exists (load more), otherwise replace (initial load for section)
                // Note: If cursor is passed, we append. If not, we overwrite (fresh section load).
                const newPhotos = cursor
                    ? [...existing.photos, ...res.photos]
                    : res.photos;

                return {
                    ...prev,
                    [sectionId]: {
                        photos: newPhotos,
                        nextCursor: res.nextCursor,
                        isLoading: false,
                        isInitialized: true
                    }
                };
            });

        } catch (error) {
            console.error('Failed to load photos:', error);
            toast.error('Failed to load photos');
            setSectionData(prev => ({
                ...prev,
                [sectionId]: {
                    ...(prev[sectionId] || { photos: [], nextCursor: null, isInitialized: false }),
                    isLoading: false,
                    // keep isInitialized false so we can retry? Or true to stop retrying loop?
                    // Let's keep it as before or set isInitialized true to prevent infinite loop.
                    isInitialized: true
                }
            }));
        }
    }, [galleryId]);

    // P2: Handle section switch with scroll
    const handleSectionChange = useCallback((sectionId: string) => {
        setActiveSection(sectionId);

        // Scroll to top of grid
        if (galleryStartRef.current) {
            galleryStartRef.current.scrollIntoView({ behavior: 'smooth' });
        } else {
            galleryGridRef.current?.scrollIntoView({ behavior: 'smooth' });
        }

    }, []);

    // P2: Fetch data when section changes
    useEffect(() => {
        if (activeSection !== 'all' && !sectionData[activeSection]?.isInitialized && !sectionData[activeSection]?.isLoading) {
            loadSectionItems(activeSection);
        }
    }, [activeSection, sectionData, loadSectionItems]);

    // P0-5: Download all photos as ZIP
    // Server streams ZIP directly - no CORS issues since backend-to-S3 is not browser-initiated
    const handleDownloadAll = useCallback(async () => {
        if (isDownloading) return;

        setIsDownloading(true);
        try {
            toast.info('Preparing your download... This may take a moment.');

            // Get the session token for authentication
            const token = getSessionToken();
            if (!token) {
                toast.error('Please log in to download photos');
                setIsDownloading(false);
                return;
            }

            // Build the download URL with auth token
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
            const downloadUrl = `${API_URL}/api/photos/gallery/${galleryId}/download-all`;

            // Use fetch with streaming to handle the download
            // This allows us to show progress and handle errors properly
            const response = await fetch(downloadUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                // Handle both string and object error formats
                const message =
                    typeof errorData.error === 'string'
                        ? errorData.error
                        : (errorData.error?.message || errorData.message || 'Download failed');
                throw new Error(message);
            }

            // Get filename from Content-Disposition header
            const contentDisposition = response.headers.get('Content-Disposition');
            const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/);
            const filename = filenameMatch?.[1] || 'gallery.zip';

            // Convert response to blob
            const blob = await response.blob();

            // Create download link
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Clean up
            URL.revokeObjectURL(blobUrl);

            toast.success('Download complete!');
        } catch (error: any) {
            console.error('[DOWNLOAD_ALL] Error:', error);
            toast.error(error.message || 'Failed to download photos');
        } finally {
            setIsDownloading(false);
        }
    }, [galleryId, isDownloading]);

    // Load guest selfie from sessionStorage
    useEffect(() => {
        const savedSelfie = sessionStorage.getItem('guest_selfie_preview');
        if (savedSelfie) {
            setGuestSelfiePreview(savedSelfie);
            setIsPrimaryClient(false); // Guest users have a stored selfie
        }
    }, []);

    // Load comments when photo is selected
    useEffect(() => {
        if (selectedPhoto) {
            commentApi.getByPhoto(selectedPhoto.id, true)
                .then(({ comments }) => setComments(comments))
                .catch(() => setComments([]));
        }
    }, [selectedPhoto]);

    // P2: Pagination Logic
    const sections = gallery?.sections || [];
    const currentSectionState = sectionData[activeSection] || { photos: [], nextCursor: null, isLoading: false, isInitialized: false };

    // Use the loaded photos for the current section
    let filteredPhotos = currentSectionState.photos || [];

    // Infinite Scroll Observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting &&
                    currentSectionState.nextCursor &&
                    !currentSectionState.isLoading
                ) {
                    loadSectionItems(activeSection, currentSectionState.nextCursor);
                }
            },
            { threshold: 0.1, rootMargin: '400px' }
        );

        const sentinel = document.getElementById('scroll-sentinel');
        if (sentinel) observer.observe(sentinel);

        return () => observer.disconnect();
    }, [activeSection, currentSectionState, loadSectionItems]);

    // Apply favorites filter if enabled
    if (showFavoritesOnly) {
        filteredPhotos = filteredPhotos.filter(p => selectedIds.has(p.id));
    }

    // Navigation helpers for photo viewer (must be after filteredPhotos)
    const currentPhotoIndex = selectedPhoto ? filteredPhotos.findIndex(p => p.id === selectedPhoto.id) : -1;
    const hasPrevPhoto = currentPhotoIndex > 0;
    const hasNextPhoto = currentPhotoIndex < filteredPhotos.length - 1;

    const goToPrevPhoto = useCallback(() => {
        if (hasPrevPhoto) {
            setSelectedPhoto(filteredPhotos[currentPhotoIndex - 1]);
        }
    }, [hasPrevPhoto, currentPhotoIndex, filteredPhotos]);

    const goToNextPhoto = useCallback(() => {
        if (hasNextPhoto) {
            setSelectedPhoto(filteredPhotos[currentPhotoIndex + 1]);
        }
    }, [hasNextPhoto, currentPhotoIndex, filteredPhotos]);

    // Keyboard navigation for photo viewer
    useEffect(() => {
        if (!selectedPhoto) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') {
                goToPrevPhoto();
            } else if (e.key === 'ArrowRight') {
                goToNextPhoto();
            } else if (e.key === 'Escape') {
                setSelectedPhoto(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedPhoto, goToPrevPhoto, goToNextPhoto]);

    // Slideshow controls
    const startSlideshow = useCallback((fromIndex: number, launchedFrom: 'grid' | 'canvas') => {
        setSlideshowIndex(fromIndex);
        setSlideshowLaunchedFrom(launchedFrom);
        setSlideshowPaused(false);
        setSlideshowActive(true);
    }, []);

    const closeSlideshow = useCallback(() => {
        setSlideshowActive(false);
        if (slideshowTimerRef.current) {
            clearInterval(slideshowTimerRef.current);
            slideshowTimerRef.current = null;
        }
        // Return to previous view
        if (slideshowLaunchedFrom === 'canvas' && filteredPhotos[slideshowIndex]) {
            setSelectedPhoto(filteredPhotos[slideshowIndex]);
        }
    }, [slideshowLaunchedFrom, slideshowIndex, filteredPhotos]);

    const slideshowGoNext = useCallback(() => {
        setSlideshowIndex((prev) => (prev + 1) % filteredPhotos.length);
    }, [filteredPhotos.length]);

    const slideshowGoPrev = useCallback(() => {
        setSlideshowIndex((prev) => (prev - 1 + filteredPhotos.length) % filteredPhotos.length);
    }, [filteredPhotos.length]);

    // Slideshow autoplay effect
    useEffect(() => {
        if (!slideshowActive || slideshowPaused || filteredPhotos.length === 0) {
            if (slideshowTimerRef.current) {
                clearInterval(slideshowTimerRef.current);
                slideshowTimerRef.current = null;
            }
            return;
        }

        slideshowTimerRef.current = setInterval(() => {
            setSlideshowIndex((prev) => (prev + 1) % filteredPhotos.length);
        }, 4000); // 4 seconds per photo

        return () => {
            if (slideshowTimerRef.current) {
                clearInterval(slideshowTimerRef.current);
                slideshowTimerRef.current = null;
            }
        };
    }, [slideshowActive, slideshowPaused, filteredPhotos.length]);

    // Slideshow keyboard controls
    useEffect(() => {
        if (!slideshowActive) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                closeSlideshow();
            } else if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
                setSlideshowPaused((prev) => !prev);
            } else if (e.key === 'ArrowLeft') {
                slideshowGoPrev();
            } else if (e.key === 'ArrowRight') {
                slideshowGoNext();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [slideshowActive, closeSlideshow, slideshowGoNext, slideshowGoPrev]);

    const toggleSelection = async (photoId: string) => {
        if (!gallery || gallery.selectionState !== 'OPEN') {
            toast.error('Selection is not currently open');
            return;
        }

        const isSelected = selectedIds.has(photoId);
        const newSelected = new Set(selectedIds);
        if (isSelected) {
            newSelected.delete(photoId);
        } else {
            newSelected.add(photoId);
        }
        setSelectedIds(newSelected);

        try {
            if (isSelected) {
                await selectionApi.unselect(photoId);
            } else {
                await selectionApi.select(photoId);
            }
        } catch (error) {
            setSelectedIds(selectedIds);
            toast.error(error instanceof Error ? error.message : 'Failed to update selection');
        }
    };

    const handleDownload = async (photo: Photo) => {
        if (!gallery?.downloadsEnabled) {
            toast.error('Downloads are not enabled for this gallery');
            return;
        }

        try {
            const { downloadUrl } = await photoApi.download(photo.id, true);
            window.open(downloadUrl, '_blank');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Download failed');
        }
    };

    const handleAddComment = async () => {
        if (!newComment.trim() || !selectedPhoto) return;

        setIsSubmittingComment(true);
        try {
            const { comment } = await commentApi.create(selectedPhoto.id, newComment.trim());
            setComments([...comments, comment]);
            setNewComment('');
            toast.success('Comment added');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to add comment');
        } finally {
            setIsSubmittingComment(false);
        }
    };

    const handlePrintRequest = async () => {
        if (!selectedPhoto) return;

        setIsSubmittingPrint(true);
        try {
            await printApi.create(selectedPhoto.id, {
                quantity: printQuantity,
                size: printSize || undefined,
                notes: printNotes || undefined,
            });
            toast.success('Print request submitted');
            setShowPrintDialog(false);
            setPrintQuantity(1);
            setPrintSize('');
            setPrintNotes('');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to submit print request');
        } finally {
            setIsSubmittingPrint(false);
        }
    };

    const handleSelfieFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setNewSelfieFile(file);
            const reader = new FileReader();
            reader.onload = () => setNewSelfiePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleReMatchSelfie = async () => {
        if (!newSelfieFile) return;

        setIsReMatchingSelfie(true);
        try {
            // We need the mobile number - retrieve from a prompt or session
            const mobileNumber = prompt('Enter your mobile number to re-match:');
            if (!mobileNumber) {
                setIsReMatchingSelfie(false);
                return;
            }

            const result = await faceApi.guestAccess(galleryId, mobileNumber, newSelfieFile);
            setSessionToken(result.sessionToken);

            // Update stored selfie
            if (newSelfiePreview) {
                sessionStorage.setItem('guest_selfie_preview', newSelfiePreview);
                sessionStorage.setItem('guest_matched_count', result.matchedCount.toString());
                setGuestSelfiePreview(newSelfiePreview);
            }

            if (result.matchedCount === 0) {
                toast.info('No photos found matching your new selfie.');
            } else {
                toast.success(`Found ${result.matchedCount} photos with your new selfie!`);
            }

            // Reset UI and reload data
            setShowSelfieChange(false);
            setNewSelfieFile(null);
            setNewSelfiePreview(null);
            loadData();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to re-match selfie');
        } finally {
            setIsReMatchingSelfie(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background">
                <header className="border-b">
                    <div className="container mx-auto px-4 py-4">
                        <Skeleton className="h-8 w-48" />
                    </div>
                </header>
                <main className="container mx-auto px-4 py-8">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                            <Skeleton key={i} className="aspect-square rounded-lg" />
                        ))}
                    </div>
                </main>
            </div>
        );
    }

    if (!gallery) return null;

    // Guests are identified by having a selfie preview - they cannot select
    const isGuest = !!guestSelfiePreview;
    const canSelect = gallery.selectionState === 'OPEN' && !isGuest;
    const canDownload = gallery.downloadsEnabled;
    const canComment = !isGuest && gallery.commentsEnabled !== false;

    // Get cover photo - only if explicitly set by photographer (no fallback)
    const coverPhoto = gallery.coverPhoto || null;
    const eventDateFormatted = gallery.eventDate
        ? new Date(gallery.eventDate).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        }).toUpperCase()
        : null;

    // Scroll to the top of the photo grid (accounting for sticky header)
    const scrollToGallery = () => {
        if (galleryStartRef.current) {
            galleryStartRef.current.scrollIntoView({ behavior: 'smooth' });
        } else {
            // Fallback
            galleryGridRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    };

    return (
        <div className="min-h-screen bg-background">
            {/* Hero Section - Pixieset-style full-screen layout */}
            {coverPhoto && (
                <section className="relative h-screen w-full overflow-hidden">
                    {/* Cover Photo Background */}
                    <img
                        src={coverPhoto.webUrl || coverPhoto.lqipBase64}
                        alt={gallery.name}
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{
                            backgroundImage: coverPhoto.lqipBase64 ? `url(${coverPhoto.lqipBase64})` : undefined,
                            backgroundSize: 'cover',
                            // Portrait photos: align from top to prevent face cropping
                            // Landscape photos: center normally
                            objectPosition: (coverPhoto.height && coverPhoto.width && coverPhoto.height > coverPhoto.width)
                                ? 'top'
                                : 'center',
                        }}
                    />

                    {/* Dark Gradient Overlay - subtle top to bottom */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/60" />

                    {/* Hero Content - Centered */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white px-4">
                        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-normal md:font-medium tracking-wide mb-2 drop-shadow-lg">
                            {gallery.name}
                        </h1>
                        {eventDateFormatted && (
                            <p className="text-xs sm:text-sm tracking-[0.2em] text-white/70 mb-8 font-light">
                                {eventDateFormatted}
                            </p>
                        )}
                        <button
                            onClick={scrollToGallery}
                            className="px-6 py-2.5 bg-transparent border border-white/60 rounded-sm text-white font-light text-xs sm:text-sm uppercase tracking-[0.15em] hover:bg-white/10 transition-all"
                        >
                            View Gallery
                        </button>
                    </div>

                    {/* Studio Branding - Bottom Center */}
                    {gallery.photographer && (
                        <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center text-white/80">
                            {/* Content Wrapper - Clickable if websiteUrl exists */}
                            {gallery.photographer.websiteUrl ? (
                                <a
                                    href={gallery.photographer.websiteUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex flex-col items-center group cursor-pointer hover:opacity-90 transition-opacity"
                                >
                                    {/* Studio Logo or Initials */}
                                    {gallery.photographer.logoUrl ? (
                                        <img
                                            src={gallery.photographer.logoUrl}
                                            alt={gallery.photographer.businessName || gallery.photographer.name}
                                            className="w-12 h-12 rounded-full object-cover mb-2 border border-white/20 group-hover:border-white/40 transition-colors"
                                        />
                                    ) : (
                                        <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center mb-2 group-hover:border-white/40 transition-colors">
                                            <span className="text-sm font-medium text-white/80">
                                                {(gallery.photographer.businessName || gallery.photographer.name)
                                                    .split(' ')
                                                    .map(word => word[0])
                                                    .join('')
                                                    .slice(0, 2)
                                                    .toUpperCase()}
                                            </span>
                                        </div>
                                    )}
                                    {/* Studio Name */}
                                    <span className="text-xs tracking-[0.15em] uppercase font-light">
                                        {gallery.photographer.businessName || gallery.photographer.name}
                                    </span>
                                </a>
                            ) : (
                                <>
                                    {/* Studio Logo or Initials - Static */}
                                    {gallery.photographer.logoUrl ? (
                                        <img
                                            src={gallery.photographer.logoUrl}
                                            alt={gallery.photographer.businessName || gallery.photographer.name}
                                            className="w-12 h-12 rounded-full object-cover mb-2 border border-white/20"
                                        />
                                    ) : (
                                        <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center mb-2">
                                            <span className="text-sm font-medium text-white/80">
                                                {(gallery.photographer.businessName || gallery.photographer.name)
                                                    .split(' ')
                                                    .map(word => word[0])
                                                    .join('')
                                                    .slice(0, 2)
                                                    .toUpperCase()}
                                            </span>
                                        </div>
                                    )}
                                    {/* Studio Name */}
                                    <span className="text-xs tracking-[0.15em] uppercase font-light">
                                        {gallery.photographer.businessName || gallery.photographer.name}
                                    </span>
                                </>
                            )}
                        </div>
                    )}
                </section>
            )}

            {/* Gallery Header - Event Info, Sections, CTAs */}
            <GalleryHeader
                gallery={gallery}
                sections={sections}
                photos={filteredPhotos}
                activeSection={activeSection}
                setActiveSection={handleSectionChange} // P2: Use handler with scroll logic
                selectedIds={selectedIds}
                showFavoritesOnly={showFavoritesOnly}
                setShowFavoritesOnly={setShowFavoritesOnly}
                onStartSlideshow={() => {
                    setSlideshowLaunchedFrom('grid');
                    setSlideshowIndex(0);
                    setSlideshowActive(true);
                }}
                onDownloadAll={handleDownloadAll}
                isDownloading={isDownloading}
                canDownload={gallery.downloadsEnabled}
                canSelect={gallery.selectionState !== 'DISABLED'}
                totalPhotoCount={gallery._count?.photos || 0}
            />

            {/* Guest Selfie Card - Shown if guest uploaded a selfie */}
            {guestSelfiePreview && (
                <div className="container mx-auto px-4 pt-4">
                    <Card className="p-4">
                        <div className="flex items-center gap-4">
                            <img
                                src={guestSelfiePreview}
                                alt="Your selfie"
                                className="w-16 h-16 rounded-full object-cover border-2 border-primary"
                            />
                            <div className="flex-1">
                                <p className="text-sm font-medium">Your uploaded selfie</p>
                                <p className="text-xs text-muted-foreground">
                                    Showing photos where you appear
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowSelfieChange(!showSelfieChange)}
                            >
                                {showSelfieChange ? 'Cancel' : 'Change Selfie'}
                            </Button>
                        </div>

                        {showSelfieChange && (
                            <div className="mt-4 pt-4 border-t space-y-4">
                                <div
                                    className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                                    onClick={() => selfieInputRef.current?.click()}
                                >
                                    {newSelfiePreview ? (
                                        <img
                                            src={newSelfiePreview}
                                            alt="New selfie preview"
                                            className="max-h-32 mx-auto rounded-lg"
                                        />
                                    ) : (
                                        <div className="py-4">
                                            <div className="text-2xl mb-1">📷</div>
                                            <p className="text-sm text-muted-foreground">Click to select new selfie</p>
                                        </div>
                                    )}
                                </div>
                                <input
                                    ref={selfieInputRef}
                                    type="file"
                                    accept="image/*"
                                    capture="user"
                                    onChange={handleSelfieFileChange}
                                    className="hidden"
                                />
                                <Button
                                    className="w-full"
                                    disabled={!newSelfieFile || isReMatchingSelfie}
                                    onClick={handleReMatchSelfie}
                                >
                                    {isReMatchingSelfie ? 'Re-matching...' : 'Re-match with New Selfie'}
                                </Button>
                            </div>
                        )}
                    </Card>
                </div>
            )}

            <main ref={galleryGridRef} className="container mx-auto px-4 py-8">

                {/* Scroll Anchor for Back to Top - accounts for sticky header height */}
                <div ref={galleryStartRef} className="scroll-mt-32" />

                {/* Photo Grid */}
                {filteredPhotos.length === 0 ? (
                    <Card className="text-center py-12">
                        <CardContent>
                            <div className="space-y-4">
                                <div className="text-6xl">{showFavoritesOnly ? '❤️' : '📷'}</div>
                                <h3 className="text-xl font-semibold">
                                    {showFavoritesOnly ? 'No favorites yet' : 'No photos found'}
                                </h3>
                                <p className="text-muted-foreground">
                                    {showFavoritesOnly
                                        ? "Click the heart icon on photos you love to add them to your favorites"
                                        : getSessionToken()
                                            ? "No photos match your face in this gallery"
                                            : "This gallery is empty"
                                    }
                                </p>
                                {showFavoritesOnly ? (
                                    <Button variant="outline" onClick={() => setShowFavoritesOnly(false)}>
                                        View All Photos
                                    </Button>
                                ) : (
                                    <Button asChild variant="outline">
                                        <Link href={`/g/${galleryId}/access`}>Try a different selfie</Link>
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="columns-2 md:columns-3 lg:columns-4 gap-3 space-y-3">
                        {filteredPhotos.map((photo) => {
                            // Determine if this is a portrait or landscape image based on dimensions
                            const isPortrait = photo.height && photo.width ? photo.height > photo.width : false;

                            return (
                                <div
                                    key={photo.id}
                                    className="break-inside-avoid overflow-hidden bg-muted relative group cursor-pointer mb-3 shadow-sm hover:shadow-lg transition-shadow"
                                    onClick={() => setSelectedPhoto(photo)}
                                >
                                    <img
                                        src={photo.webUrl || photo.lqipBase64}
                                        alt={photo.filename}
                                        className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                                        style={{
                                            backgroundImage: photo.lqipBase64 ? `url(${photo.lqipBase64})` : undefined,
                                            backgroundSize: 'cover',
                                        }}
                                        loading="lazy"
                                    />

                                    {/* Selection Heart */}
                                    {canSelect && (
                                        <button
                                            className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white/80 backdrop-blur-sm shadow-md hover:bg-white transition-all hover:scale-110"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleSelection(photo.id);
                                            }}
                                        >
                                            {selectedIds.has(photo.id) ? (
                                                <svg className="w-5 h-5 text-rose-500" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                                                </svg>
                                            ) : (
                                                <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                                                </svg>
                                            )}
                                        </button>
                                    )}

                                    {/* Hover overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                                    {/* Download/Action indicator on hover */}
                                    {canDownload && (
                                        <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                            <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-md">
                                                <svg className="w-4 h-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                                </svg>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* P2: Infinite Scroll Sentinel & Loader */}
                <div id="scroll-sentinel" className="h-4 w-full" />

                {currentSectionState.isLoading && (
                    <div className="flex flex-col items-center justify-center py-8 gap-3 opacity-60">
                        <div className="w-8 h-8 rounded-full border-2 border-gray-300 border-t-gray-800 animate-spin" />
                        <span className="text-xs uppercase tracking-widest text-gray-400">Loading Photos...</span>
                    </div>
                )}

                {/* Back to Top CTA */}
                {filteredPhotos.length > 10 && (
                    <div className="flex justify-center py-12 pb-4">
                        <button
                            onClick={scrollToGallery}
                            className="bg-gray-100/50 hover:bg-gray-100 text-gray-400 hover:text-gray-600 px-6 py-3 rounded-full text-xs font-medium tracking-[0.1em] transition-all duration-300"
                            aria-label="Back to top of gallery"
                        >
                            [ BACK TO TOP ]
                        </button>
                    </div>
                )}


                {/* What's Next CTA Section */}
                {gallery.photographer && (
                    <GalleryNextSteps
                        galleryName={gallery.name}
                        gallerySlug={gallery.customSlug || gallery.id}
                        accessCode={gallery.customPassword || gallery.privateKey?.slice(0, 8).toUpperCase() || undefined}
                        studio={{
                            name: gallery.photographer.businessName || gallery.photographer.name,
                            logoUrl: gallery.photographer.logoUrl || null,
                            websiteUrl: gallery.photographer.websiteUrl || null,
                            reviewUrl: gallery.photographer.reviewUrl || null,
                            whatsappNumber: gallery.photographer.whatsappNumber || null,
                        }}
                    />
                )}
            </main>

            {/* Full-Canvas Photo Viewer */}
            {selectedPhoto && (
                <div className="fixed inset-0 z-50 bg-stone-100">
                    {/* Header */}
                    <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 md:px-6 py-4 bg-white/80 backdrop-blur-sm border-b border-gray-200">
                        <button
                            onClick={() => setSelectedPhoto(null)}
                            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            <span className="text-sm font-medium hidden sm:inline">Back to Gallery</span>
                        </button>
                        <div className="flex items-center gap-3">
                            {/* Slideshow Play Button */}
                            <button
                                onClick={() => {
                                    setSelectedPhoto(null);
                                    startSlideshow(currentPhotoIndex, 'canvas');
                                }}
                                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                                title="Start Slideshow"
                            >
                                <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            </button>
                            <div className="text-sm text-gray-500">
                                {currentPhotoIndex + 1} of {filteredPhotos.length}
                            </div>
                        </div>
                    </div>

                    {/* Main Content - Split Layout */}
                    <div className="flex h-full pt-16">
                        {/* Left Panel - Image Canvas (80% on desktop, full on mobile) */}
                        <div className="flex-1 lg:w-4/5 relative flex items-center justify-center bg-stone-100 p-4 md:p-8">
                            {/* Previous Arrow */}
                            <button
                                onClick={goToPrevPhoto}
                                disabled={!hasPrevPhoto}
                                className={`absolute left-2 md:left-6 top-1/2 -translate-y-1/2 z-10 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white shadow-lg flex items-center justify-center transition-all ${hasPrevPhoto
                                    ? 'hover:bg-gray-50 hover:scale-105 cursor-pointer opacity-80 hover:opacity-100'
                                    : 'opacity-30 cursor-not-allowed'
                                    }`}
                            >
                                <svg className="w-5 h-5 md:w-6 md:h-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>

                            {/* Image */}
                            <div className="max-w-full max-h-full flex items-center justify-center relative">
                                <img
                                    src={selectedPhoto.webUrl || selectedPhoto.lqipBase64}
                                    alt={selectedPhoto.filename}
                                    className="max-w-full max-h-[calc(100vh-10rem)] object-contain shadow-2xl"
                                    style={{
                                        backgroundImage: selectedPhoto.lqipBase64 ? `url(${selectedPhoto.lqipBase64})` : undefined,
                                        backgroundSize: 'cover',
                                    }}
                                />

                                {/* Selection Heart - Over Image */}
                                {canSelect && (
                                    <button
                                        className="absolute top-4 right-4 p-2.5 rounded-full bg-white/90 backdrop-blur-sm shadow-lg hover:bg-white transition-all hover:scale-110"
                                        onClick={() => toggleSelection(selectedPhoto.id)}
                                    >
                                        {selectedIds.has(selectedPhoto.id) ? (
                                            <svg className="w-6 h-6 text-rose-500" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                                            </svg>
                                        ) : (
                                            <svg className="w-6 h-6 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                                            </svg>
                                        )}
                                    </button>
                                )}
                            </div>

                            {/* Next Arrow */}
                            <button
                                onClick={goToNextPhoto}
                                disabled={!hasNextPhoto}
                                className={`absolute right-2 md:right-6 top-1/2 -translate-y-1/2 z-10 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white shadow-lg flex items-center justify-center transition-all ${hasNextPhoto
                                    ? 'hover:bg-gray-50 hover:scale-105 cursor-pointer opacity-80 hover:opacity-100'
                                    : 'opacity-30 cursor-not-allowed'
                                    }`}
                            >
                                <svg className="w-5 h-5 md:w-6 md:h-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>

                        {/* Right Panel - Actions (20% on desktop, hidden on mobile - shown in bottom sheet) */}
                        <div className="hidden lg:flex lg:w-1/5 bg-white border-l border-gray-200 flex-col">
                            <div className="flex-1 overflow-y-auto p-6 pt-8">
                                {/* Action Buttons */}
                                <div className="space-y-3 mb-8">
                                    {canDownload && (
                                        <button
                                            onClick={() => handleDownload(selectedPhoto)}
                                            className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 font-medium"
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                            Download
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setShowPrintDialog(true)}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 font-medium"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                        </svg>
                                        Request Print
                                    </button>
                                </div>

                                {/* Comments Section */}
                                <div className="border-t border-gray-200 pt-6">
                                    <h4 className="font-semibold text-gray-900 mb-4">Comments</h4>

                                    {/* Comments List */}
                                    <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                                        {comments.length === 0 ? (
                                            <p className="text-sm text-gray-500">No comments yet</p>
                                        ) : (
                                            comments.map((comment) => (
                                                <div key={comment.id} className="bg-gray-50 p-3 rounded-lg">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className="text-sm font-medium text-gray-900">
                                                            {comment.primaryClient?.name || 'Client'}
                                                        </span>
                                                        <span className="text-xs text-gray-500">
                                                            {new Date(comment.createdAt).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-gray-700">{comment.content}</p>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    {/* Add Comment */}
                                    {canComment && (
                                        <div className="space-y-2">
                                            <Input
                                                placeholder="Add a comment..."
                                                value={newComment}
                                                onChange={(e) => setNewComment(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                                                className="text-sm"
                                            />
                                            <Button
                                                onClick={handleAddComment}
                                                disabled={isSubmittingComment || !newComment.trim()}
                                                className="w-full"
                                                size="sm"
                                            >
                                                {isSubmittingComment ? 'Posting...' : 'Post'}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Mobile Bottom Action Bar */}
                    <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 flex items-center justify-center gap-4">
                        {canDownload && (
                            <button
                                onClick={() => handleDownload(selectedPhoto)}
                                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 font-medium text-sm"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Download
                            </button>
                        )}
                        <button
                            onClick={() => setShowPrintDialog(true)}
                            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 font-medium text-sm"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                            Request Print
                        </button>
                    </div>
                </div>
            )}

            {/* Slideshow Mode */}
            {slideshowActive && filteredPhotos.length > 0 && (
                <div className="fixed inset-0 z-[60] bg-black flex items-center justify-center">
                    {/* Top Controls */}
                    <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-4">
                        {/* Photo Counter */}
                        <div className="text-white/70 text-sm font-medium">
                            {slideshowIndex + 1} / {filteredPhotos.length}
                        </div>

                        {/* Right Controls */}
                        <div className="flex items-center gap-2">
                            {/* Pause/Play Toggle */}
                            <button
                                onClick={() => setSlideshowPaused((prev) => !prev)}
                                className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                                title={slideshowPaused ? 'Play' : 'Pause'}
                            >
                                {slideshowPaused ? (
                                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                ) : (
                                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                    </svg>
                                )}
                            </button>

                            {/* Close Button */}
                            <button
                                onClick={closeSlideshow}
                                className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                                title="Close Slideshow"
                            >
                                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Navigation Arrows */}
                    <button
                        onClick={slideshowGoPrev}
                        className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                    >
                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>

                    <button
                        onClick={slideshowGoNext}
                        className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                    >
                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>

                    {/* Photo Display with Fade Transition */}
                    <div className="relative max-w-[90vw] max-h-[85vh] flex items-center justify-center">
                        <img
                            key={filteredPhotos[slideshowIndex]?.id}
                            src={filteredPhotos[slideshowIndex]?.webUrl || filteredPhotos[slideshowIndex]?.lqipBase64}
                            alt={filteredPhotos[slideshowIndex]?.filename}
                            className="max-w-full max-h-[85vh] object-contain animate-fade-in"
                            style={{
                                animation: 'fadeIn 0.5s ease-in-out',
                            }}
                        />

                        {/* Heart Indicator for Selected Photos */}
                        {canSelect && selectedIds.has(filteredPhotos[slideshowIndex]?.id) && (
                            <div className="absolute top-4 right-4 p-2 rounded-full bg-white/20 backdrop-blur-sm">
                                <svg className="w-5 h-5 text-rose-400" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                                </svg>
                            </div>
                        )}
                    </div>

                    {/* Paused Indicator */}
                    {slideshowPaused && (
                        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-white/80 text-sm font-medium">
                            Paused
                        </div>
                    )}
                </div>
            )}

            {/* Print Request Dialog */}
            <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Request Print</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Quantity</Label>
                            <Input
                                type="number"
                                min={1}
                                max={100}
                                value={printQuantity}
                                onChange={(e) => setPrintQuantity(parseInt(e.target.value) || 1)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Size (optional)</Label>
                            <Input
                                placeholder="e.g., 4x6, 8x10, 11x14"
                                value={printSize}
                                onChange={(e) => setPrintSize(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Notes (optional)</Label>
                            <Input
                                placeholder="Any special requests..."
                                value={printNotes}
                                onChange={(e) => setPrintNotes(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowPrintDialog(false)}>Cancel</Button>
                        <Button onClick={handlePrintRequest} disabled={isSubmittingPrint}>
                            {isSubmittingPrint ? 'Submitting...' : 'Submit Request'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
}
