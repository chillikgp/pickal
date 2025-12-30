'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { galleryApi, photoApi, sectionApi, commentApi, Gallery, Photo, Section } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

export default function GalleryDetailPage() {
    const params = useParams();
    const router = useRouter();
    const galleryId = params.id as string;

    const [gallery, setGallery] = useState<Gallery | null>(null);
    const [photos, setPhotos] = useState<Photo[]>([]);
    const [sections, setSections] = useState<Section[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    // Section management
    const [activeSection, setActiveSection] = useState<string>('all');
    const [newSectionName, setNewSectionName] = useState('');
    const [uploadSectionId, setUploadSectionId] = useState<string>('');
    const [isSectionDialogOpen, setIsSectionDialogOpen] = useState(false);

    // Settings state
    const [downloadsEnabled, setDownloadsEnabled] = useState(false);
    const [downloadResolution, setDownloadResolution] = useState<'web' | 'original'>('web');
    const [selectionState, setSelectionState] = useState<'DISABLED' | 'OPEN' | 'LOCKED'>('DISABLED');

    // Edit details state
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editEventDate, setEditEventDate] = useState('');
    const [isSavingDetails, setIsSavingDetails] = useState(false);

    const loadGallery = useCallback(async () => {
        try {
            const [galleryRes, photosRes] = await Promise.all([
                galleryApi.get(galleryId),
                photoApi.getByGallery(galleryId),
            ]);
            setGallery(galleryRes.gallery);
            setPhotos(photosRes.photos);
            setSections(galleryRes.gallery.sections || []);
            setDownloadsEnabled(galleryRes.gallery.downloadsEnabled);
            setDownloadResolution(galleryRes.gallery.downloadResolution);
            setSelectionState(galleryRes.gallery.selectionState);
            // Initialize edit fields
            setEditName(galleryRes.gallery.name);
            setEditDescription(galleryRes.gallery.description || '');
            setEditEventDate(galleryRes.gallery.eventDate ? galleryRes.gallery.eventDate.split('T')[0] : '');
        } catch (error) {
            toast.error('Failed to load gallery');
            router.push('/dashboard');
        } finally {
            setIsLoading(false);
        }
    }, [galleryId, router]);

    useEffect(() => {
        loadGallery();
    }, [loadGallery]);

    // Comment state
    const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
    const [comments, setComments] = useState<any[]>([]);

    // Load comments when photo is selected
    useEffect(() => {
        if (selectedPhoto) {
            commentApi.getByPhoto(selectedPhoto.id)
                .then(({ comments }) => setComments(comments))
                .catch(() => setComments([]));
        }
    }, [selectedPhoto]);

    const handleDeletePhoto = async () => {
        if (!selectedPhoto) return;
        if (!confirm('Delete this photo? This cannot be undone.')) return;

        try {
            await photoApi.delete(selectedPhoto.id);
            toast.success('Photo deleted');
            setSelectedPhoto(null);
            loadGallery();
        } catch (error) {
            toast.error('Failed to delete photo');
        }
    };

    // Filter selections
    const [viewSelectedOnly, setViewSelectedOnly] = useState(false);

    // Calculate selection stats
    const selectedPhotoCount = photos.filter(p => (p._count?.selections || 0) > 0).length;
    const totalSelections = photos.reduce((acc, p) => acc + (p._count?.selections || 0), 0);

    // Filter photos by active section and selection status
    const filteredPhotos = photos
        .filter(p => activeSection === 'all' || p.sectionId === activeSection)
        .filter(p => !viewSelectedOnly || (p._count?.selections || 0) > 0);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setIsUploading(true);
        setUploadProgress(0);

        const fileArray = Array.from(files);
        let uploaded = 0;

        for (const file of fileArray) {
            try {
                await photoApi.upload(galleryId, file, uploadSectionId || undefined);
                uploaded++;
                setUploadProgress(Math.round((uploaded / fileArray.length) * 100));
            } catch (error) {
                toast.error(`Failed to upload ${file.name}`);
            }
        }

        toast.success(`Uploaded ${uploaded} photos`);
        setIsUploading(false);
        loadGallery();
        e.target.value = '';
    };

    const handleCreateSection = async () => {
        if (!newSectionName.trim()) {
            toast.error('Section name is required');
            return;
        }

        try {
            await sectionApi.create({
                galleryId,
                name: newSectionName.trim(),
            });
            toast.success('Section created');
            setNewSectionName('');
            setIsSectionDialogOpen(false);
            loadGallery();
        } catch (error) {
            toast.error('Failed to create section');
        }
    };

    const handleDeleteSection = async (sectionId: string) => {
        if (!confirm('Delete this section? Photos will be moved to "All Photos".')) return;

        try {
            await sectionApi.delete(sectionId);
            toast.success('Section deleted');
            if (activeSection === sectionId) setActiveSection('all');
            loadGallery();
        } catch (error) {
            toast.error('Failed to delete section');
        }
    };

    const handleSettingUpdate = async (updates: Partial<Gallery>) => {
        try {
            await galleryApi.update(galleryId, updates);
            toast.success('Settings updated');
        } catch (error) {
            toast.error('Failed to update settings');
        }
    };

    const handleSaveDetails = async () => {
        if (!editName.trim()) {
            toast.error('Event name is required');
            return;
        }

        setIsSavingDetails(true);
        try {
            // Convert date to ISO 8601 datetime format (backend expects z.string().datetime())
            const formattedEventDate = editEventDate
                ? new Date(editEventDate).toISOString()
                : undefined;

            const updates: Partial<Gallery> = {
                name: editName.trim(),
                description: editDescription.trim() || undefined,
                eventDate: formattedEventDate,
            };
            await galleryApi.update(galleryId, updates);
            setGallery(prev => prev ? { ...prev, ...updates } : null);
            toast.success('Details updated');
        } catch (error) {
            toast.error('Failed to update details');
        } finally {
            setIsSavingDetails(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this gallery? This cannot be undone.')) return;

        try {
            await galleryApi.delete(galleryId);
            toast.success('Gallery deleted');
            router.push('/dashboard');
        } catch (error) {
            toast.error('Failed to delete gallery');
        }
    };

    const copyShareLink = () => {
        const url = `${window.location.origin}/g/${galleryId}/access`;
        navigator.clipboard.writeText(url);
        toast.success('Share link copied!');
    };

    const copyPrivateKey = () => {
        if (gallery?.privateKey) {
            navigator.clipboard.writeText(gallery.privateKey);
            toast.success('Private key copied!');
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

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="border-b sticky top-0 bg-background z-10">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
                                ← Dashboard
                            </Link>
                            <h1 className="font-bold text-xl">{gallery.name}</h1>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={copyShareLink}>Share</Button>
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button variant="outline">Settings</Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-md">
                                    <DialogHeader>
                                        <DialogTitle>Gallery Settings</DialogTitle>
                                    </DialogHeader>
                                    <Tabs defaultValue="details">
                                        <TabsList className="w-full">
                                            <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
                                            <TabsTrigger value="access" className="flex-1">Access</TabsTrigger>
                                            <TabsTrigger value="features" className="flex-1">Features</TabsTrigger>
                                        </TabsList>
                                        <TabsContent value="details" className="space-y-4 pt-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="edit-name">Event Name *</Label>
                                                <Input
                                                    id="edit-name"
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    placeholder="e.g., Wedding, Birthday Shoot"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="edit-description">Description</Label>
                                                <Input
                                                    id="edit-description"
                                                    value={editDescription}
                                                    onChange={(e) => setEditDescription(e.target.value)}
                                                    placeholder="e.g., Baby Ivaan's First Birthday"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="edit-date">Event Date</Label>
                                                <Input
                                                    id="edit-date"
                                                    type="date"
                                                    value={editEventDate}
                                                    onChange={(e) => setEditEventDate(e.target.value)}
                                                />
                                            </div>
                                            <Button
                                                onClick={handleSaveDetails}
                                                disabled={isSavingDetails || !editName.trim()}
                                                className="w-full"
                                            >
                                                {isSavingDetails ? 'Saving...' : 'Save Details'}
                                            </Button>
                                        </TabsContent>
                                        <TabsContent value="access" className="space-y-4 pt-4">
                                            <div className="space-y-2">
                                                <Label>Private Key</Label>
                                                <div className="flex gap-2">
                                                    <Input value={gallery.privateKey} readOnly className="font-mono text-sm" />
                                                    <Button variant="outline" onClick={copyPrivateKey}>Copy</Button>
                                                </div>
                                                <p className="text-xs text-muted-foreground">Share with primary clients for full access</p>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Share Link</Label>
                                                <div className="flex gap-2">
                                                    <Input value={`${window.location.origin}/g/${galleryId}/access`} readOnly className="text-sm" />
                                                    <Button variant="outline" onClick={copyShareLink}>Copy</Button>
                                                </div>
                                            </div>
                                        </TabsContent>
                                        <TabsContent value="features" className="space-y-4 pt-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <Label>Downloads</Label>
                                                    <p className="text-xs text-muted-foreground">Allow clients to download photos</p>
                                                </div>
                                                <Switch
                                                    checked={downloadsEnabled}
                                                    onCheckedChange={(checked) => {
                                                        setDownloadsEnabled(checked);
                                                        handleSettingUpdate({ downloadsEnabled: checked });
                                                    }}
                                                />
                                            </div>
                                            {downloadsEnabled && (
                                                <div className="space-y-2">
                                                    <Label>Download Resolution</Label>
                                                    <Select value={downloadResolution} onValueChange={(value: 'web' | 'original') => {
                                                        setDownloadResolution(value);
                                                        handleSettingUpdate({ downloadResolution: value });
                                                    }}>
                                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="web">Web Quality (1920px)</SelectItem>
                                                            <SelectItem value="original">Original Quality</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            )}
                                            <div className="space-y-2">
                                                <Label>Selection State</Label>
                                                <Select value={selectionState} onValueChange={(value: 'DISABLED' | 'OPEN' | 'LOCKED') => {
                                                    setSelectionState(value);
                                                    handleSettingUpdate({ selectionState: value });
                                                }}>
                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="DISABLED">Disabled</SelectItem>
                                                        <SelectItem value="OPEN">Open (clients can select)</SelectItem>
                                                        <SelectItem value="LOCKED">Locked (frozen)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="pt-4 border-t">
                                                <Button variant="destructive" onClick={handleDelete} className="w-full">Delete Gallery</Button>
                                            </div>
                                        </TabsContent>
                                    </Tabs>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                </div>
            </header >

            <main className="container mx-auto px-4 py-8">
                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{photos.length}</div><div className="text-sm text-muted-foreground">Photos</div></CardContent></Card>
                    <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{gallery._count?.primaryClients || 0}</div><div className="text-sm text-muted-foreground">Clients</div></CardContent></Card>
                    <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{gallery._count?.guests || 0}</div><div className="text-sm text-muted-foreground">Guests</div></CardContent></Card>
                    <Card>
                        <CardContent className="pt-4">
                            <Badge variant={selectionState === 'OPEN' ? 'default' : 'secondary'}>{selectionState}</Badge>
                            <div className="text-sm text-muted-foreground mt-1 mb-2">Selection Status</div>
                            <Button
                                variant={viewSelectedOnly ? "default" : "outline"}
                                size="sm"
                                className="w-full h-8 text-xs"
                                onClick={() => setViewSelectedOnly(!viewSelectedOnly)}
                                disabled={selectedPhotoCount === 0}
                            >
                                {viewSelectedOnly ? 'Show All' : `View ${selectedPhotoCount} Selected`}
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                {/* Upload Section */}
                <Card className="mb-8">
                    <CardContent className="pt-6">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <h3 className="font-semibold">Upload Photos</h3>
                                <p className="text-sm text-muted-foreground">Select a section before uploading</p>
                            </div>
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                                <Select value={uploadSectionId || 'none'} onValueChange={(v) => setUploadSectionId(v === 'none' ? '' : v)}>
                                    <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="No section" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No section</SelectItem>
                                        {sections.map((section) => (
                                            <SelectItem key={section.id} value={section.id}>{section.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Input type="file" accept="image/*" multiple onChange={handleFileUpload} disabled={isUploading} className="hidden" id="photo-upload" />
                                <label htmlFor="photo-upload">
                                    <Button asChild disabled={isUploading}><span>{isUploading ? `Uploading ${uploadProgress}%...` : 'Upload Photos'}</span></Button>
                                </label>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Section Tabs */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold">Sections</h3>
                        <Dialog open={isSectionDialogOpen} onOpenChange={setIsSectionDialogOpen}>
                            <DialogTrigger asChild><Button variant="outline" size="sm">+ Add Section</Button></DialogTrigger>
                            <DialogContent>
                                <DialogHeader><DialogTitle>Create Section</DialogTitle></DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <Label>Section Name</Label>
                                        <Input placeholder="e.g., Day 1, Ceremony, Reception" value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateSection()} />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                                    <Button onClick={handleCreateSection}>Create</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <Tabs value={activeSection} onValueChange={setActiveSection}>
                        <TabsList className="flex-wrap h-auto">
                            <TabsTrigger value="all">All Photos ({photos.length})</TabsTrigger>
                            {sections.map((section) => (
                                <TabsTrigger key={section.id} value={section.id} className="group relative">
                                    {section.name} ({photos.filter(p => p.sectionId === section.id).length})
                                    <button className="ml-2 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteSection(section.id); }}>×</button>
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>

                {/* Photo Grid */}
                {filteredPhotos.length === 0 ? (
                    <Card className="text-center py-12">
                        <CardContent>
                            <div className="space-y-4">
                                <div className="text-6xl">🖼️</div>
                                <h3 className="text-xl font-semibold">No photos {viewSelectedOnly ? 'selected' : (activeSection !== 'all' ? 'in this section' : 'yet')}</h3>
                                {viewSelectedOnly && <Button variant="link" onClick={() => setViewSelectedOnly(false)}>View All Photos</Button>}
                                {!viewSelectedOnly && <p className="text-muted-foreground">Upload photos to this gallery</p>}
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                        {filteredPhotos.map((photo) => {
                            const selectionCount = photo._count?.selections || 0;
                            const commentCount = photo._count?.comments || 0;
                            return (
                                <div
                                    key={photo.id}
                                    className={`aspect-square rounded-lg overflow-hidden bg-muted relative group cursor-pointer ${selectionCount > 0 ? 'ring-2 ring-primary ring-offset-2' : ''
                                        }`}
                                    onClick={() => setSelectedPhoto(photo)}
                                >
                                    {photo.lqipBase64 ? (
                                        <img src={photo.webUrl || photo.lqipBase64} alt={photo.filename} className="w-full h-full object-cover" loading="lazy" />
                                    ) : (
                                        <Skeleton className="w-full h-full" />
                                    )}

                                    {/* Cover Photo Indicator */}
                                    {gallery.coverPhotoId === photo.id && (
                                        <div className="absolute top-2 left-2 z-10">
                                            <Badge variant="secondary" className="shadow-md bg-yellow-500 text-white border-0">
                                                ★ Cover
                                            </Badge>
                                        </div>
                                    )}

                                    {/* Persistent Selection Indicator */}
                                    {selectionCount > 0 && (
                                        <div className="absolute top-2 right-2 z-10">
                                            <Badge variant="default" className="shadow-md border border-white/20">
                                                {selectionCount}
                                            </Badge>
                                        </div>
                                    )}

                                    {/* Persistent Comment Indicator */}
                                    {commentCount > 0 && (
                                        <div className="absolute bottom-2 left-2 z-10">
                                            <Badge variant="secondary" className="shadow-md gap-1">
                                                <span className="text-xs">💬</span> {commentCount}
                                            </Badge>
                                        </div>
                                    )}

                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <div className="text-white text-xs space-y-1 text-center">
                                            <div>{selectionCount} selections</div>
                                            {commentCount > 0 && <div>{commentCount} comments</div>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* Photo Detail Modal */}
            <Dialog open={!!selectedPhoto} onOpenChange={(open) => !open && setSelectedPhoto(null)}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{selectedPhoto?.filename}</DialogTitle>
                    </DialogHeader>
                    {selectedPhoto && (
                        <div className="space-y-6">
                            <div className="bg-black rounded-lg overflow-hidden flex items-center justify-center bg-muted/20">
                                <img
                                    src={selectedPhoto.webUrl || selectedPhoto.lqipBase64}
                                    alt={selectedPhoto.filename}
                                    className="max-h-[60vh] object-contain"
                                />
                            </div>

                            <div className="flex gap-2 flex-wrap">
                                <Button
                                    variant={gallery.coverPhotoId === selectedPhoto.id ? "default" : "outline"}
                                    onClick={async () => {
                                        try {
                                            const newCoverId = gallery.coverPhotoId === selectedPhoto.id ? undefined : selectedPhoto.id;
                                            await galleryApi.update(galleryId, { coverPhotoId: newCoverId || null });
                                            setGallery({ ...gallery, coverPhotoId: newCoverId });
                                            toast.success(newCoverId ? 'Cover photo set' : 'Cover photo removed');
                                        } catch (error) {
                                            toast.error('Failed to update cover photo');
                                        }
                                    }}
                                >
                                    {gallery.coverPhotoId === selectedPhoto.id ? '★ Cover Photo' : '☆ Set as Cover'}
                                </Button>
                                <Button variant="destructive" onClick={handleDeletePhoto}>Delete Photo</Button>
                                <Button variant="outline" asChild>
                                    <a href={selectedPhoto.webUrl} target="_blank" rel="noopener noreferrer">View Original</a>
                                </Button>
                            </div>

                            {/* Comments Section */}
                            <div className="border-t pt-6">
                                <h3 className="font-semibold mb-4 flex items-center gap-2">
                                    Comments <Badge variant="secondary">{comments.length}</Badge>
                                </h3>
                                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                                    {comments.length === 0 ? (
                                        <p className="text-muted-foreground text-sm">No comments yet</p>
                                    ) : (
                                        comments.map((comment: any) => (
                                            <div key={comment.id} className="bg-muted/50 p-3 rounded-lg text-sm space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-medium">{comment.primaryClient?.name || 'Unknown Client'}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {new Date(comment.createdAt).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <p className="text-foreground/90">{comment.content}</p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div >
    );
}
