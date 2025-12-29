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

export default function ClientGalleryPage() {
    const params = useParams();
    const router = useRouter();
    const galleryId = params.id as string;

    const [gallery, setGallery] = useState<Gallery | null>(null);
    const [photos, setPhotos] = useState<Photo[]>([]);
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

    const loadData = useCallback(async () => {
        const token = getSessionToken();
        if (!token) {
            router.push(`/g/${galleryId}/access`);
            return;
        }

        try {
            const [galleryRes, photosRes, selectionsRes] = await Promise.all([
                galleryApi.get(galleryId),
                photoApi.getByGallery(galleryId, true),
                selectionApi.getMy().catch(() => ({ selections: [] })),
            ]);

            setGallery(galleryRes.gallery);
            setPhotos(photosRes.photos);
            setSelectedIds(new Set(selectionsRes.selections.map(s => s.photoId)));

            // Check if this is a guest session
            // Guest detection now handled by selfie presence check in useEffect
            // so we don't override isPrimaryClient here
        } catch (error) {
            toast.error('Failed to load gallery');
            router.push(`/g/${galleryId}/access`);
        } finally {
            setIsLoading(false);
        }
    }, [galleryId, router]);

    useEffect(() => {
        loadData();
    }, [loadData]);

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

    // Filter photos by section
    const sections = gallery?.sections || [];
    const filteredPhotos = activeSection === 'all'
        ? photos
        : photos.filter(p => p.sectionId === activeSection);

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

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="border-b sticky top-0 bg-background z-10">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="font-bold text-xl">{gallery.name}</h1>
                            {gallery.description && (
                                <p className="text-sm text-muted-foreground">{gallery.description}</p>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {canSelect && (
                                <Badge variant="default">{selectedIds.size} selected</Badge>
                            )}
                            {canDownload && (
                                <Badge variant="secondary">Downloads enabled</Badge>
                            )}
                        </div>
                    </div>
                </div>
            </header>

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

            <main className="container mx-auto px-4 py-8">
                {/* Section Tabs */}
                {sections.length > 0 && (
                    <Tabs value={activeSection} onValueChange={setActiveSection} className="mb-6">
                        <TabsList className="flex-wrap h-auto">
                            <TabsTrigger value="all">All Photos ({photos.length})</TabsTrigger>
                            {sections.map((section) => (
                                <TabsTrigger key={section.id} value={section.id}>
                                    {section.name} ({photos.filter(p => p.sectionId === section.id).length})
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                )}

                {/* Photo Grid */}
                {filteredPhotos.length === 0 ? (
                    <Card className="text-center py-12">
                        <CardContent>
                            <div className="space-y-4">
                                <div className="text-6xl">📷</div>
                                <h3 className="text-xl font-semibold">No photos found</h3>
                                <p className="text-muted-foreground">
                                    {getSessionToken() ?
                                        "No photos match your face in this gallery" :
                                        "This gallery is empty"
                                    }
                                </p>
                                <Button asChild variant="outline">
                                    <Link href={`/g/${galleryId}/access`}>Try a different selfie</Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {filteredPhotos.map((photo) => (
                            <div
                                key={photo.id}
                                className="aspect-square rounded-lg overflow-hidden bg-muted relative group cursor-pointer"
                                onClick={() => setSelectedPhoto(photo)}
                            >
                                <img
                                    src={photo.webUrl || photo.lqipBase64}
                                    alt={photo.filename}
                                    className="w-full h-full object-cover transition-opacity"
                                    style={{
                                        backgroundImage: photo.lqipBase64 ? `url(${photo.lqipBase64})` : undefined,
                                        backgroundSize: 'cover',
                                    }}
                                    loading="lazy"
                                />

                                {/* Selection checkbox */}
                                {canSelect && (
                                    <div
                                        className="absolute top-2 left-2 z-10"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleSelection(photo.id);
                                        }}
                                    >
                                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${selectedIds.has(photo.id)
                                            ? 'bg-primary border-primary'
                                            : 'bg-white/80 border-white/80 group-hover:border-primary'
                                            }`}>
                                            {selectedIds.has(photo.id) && (
                                                <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Photo Modal */}
            <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    {selectedPhoto && (
                        <div className="space-y-4">
                            <img
                                src={selectedPhoto.webUrl || selectedPhoto.lqipBase64}
                                alt={selectedPhoto.filename}
                                className="w-full max-h-[60vh] object-contain bg-black rounded-lg"
                            />

                            {/* Action Buttons */}
                            <div className="flex flex-wrap gap-2">
                                {canSelect && (
                                    <Button
                                        variant={selectedIds.has(selectedPhoto.id) ? 'default' : 'outline'}
                                        onClick={() => toggleSelection(selectedPhoto.id)}
                                    >
                                        {selectedIds.has(selectedPhoto.id) ? 'Selected ✓' : 'Select'}
                                    </Button>
                                )}
                                {canDownload && (
                                    <Button variant="outline" onClick={() => handleDownload(selectedPhoto)}>
                                        Download
                                    </Button>
                                )}
                                <Button variant="outline" onClick={() => setShowPrintDialog(true)}>
                                    🖨️ Request Print
                                </Button>
                            </div>

                            {/* Comments Section (Primary Client Only) */}
                            {canComment && (
                                <div className="border-t pt-4 space-y-4">
                                    <h4 className="font-semibold">Comments</h4>

                                    {/* Comment List */}
                                    <div className="space-y-2 max-h-40 overflow-y-auto">
                                        {comments.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">No comments yet</p>
                                        ) : (
                                            comments.map((comment) => (
                                                <div key={comment.id} className="bg-muted p-2 rounded text-sm">
                                                    <div className="flex justify-between">
                                                        <span className="font-medium">{comment.primaryClient?.name || 'Client'}</span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {new Date(comment.createdAt).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                    <p>{comment.content}</p>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    {/* Add Comment */}
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Add a comment..."
                                            value={newComment}
                                            onChange={(e) => setNewComment(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                                        />
                                        <Button onClick={handleAddComment} disabled={isSubmittingComment || !newComment.trim()}>
                                            {isSubmittingComment ? '...' : 'Post'}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

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

            {/* Selection Bar */}
            {canSelect && selectedIds.size > 0 && (
                <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 z-20">
                    <div className="container mx-auto flex items-center justify-between">
                        <span className="font-semibold">{selectedIds.size} photos selected</span>
                        <Button variant="secondary" onClick={() => setSelectedIds(new Set())}>
                            Clear Selection
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
