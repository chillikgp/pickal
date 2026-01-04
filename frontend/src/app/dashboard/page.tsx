'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { galleryApi, authApi, Gallery } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function DashboardPage() {
    const { photographer, isLoading: authLoading, logout, refreshUser } = useAuth();
    const [galleries, setGalleries] = useState<Gallery[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    // Settings dialog state
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [editName, setEditName] = useState('');
    const [editBusinessName, setEditBusinessName] = useState('');
    const [editLogoUrl, setEditLogoUrl] = useState('');
    const [editWebsiteUrl, setEditWebsiteUrl] = useState('');
    const [editReviewUrl, setEditReviewUrl] = useState('');
    const [editWhatsappNumber, setEditWhatsappNumber] = useState('');
    const [editStudioSlug, setEditStudioSlug] = useState('');
    const [editCustomDomain, setEditCustomDomain] = useState('');
    const [websiteUrlError, setWebsiteUrlError] = useState('');
    const [studioSlugError, setStudioSlugError] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!authLoading && !photographer) {
            router.push('/login');
        }
    }, [authLoading, photographer, router]);

    useEffect(() => {
        if (photographer) {
            galleryApi.list()
                .then(({ galleries }) => setGalleries(galleries))
                .catch((error) => toast.error(error.message))
                .finally(() => setIsLoading(false));

            // Initialize settings form
            setEditName(photographer.name);
            setEditBusinessName(photographer.businessName || '');
            setEditLogoUrl(photographer.logoUrl || '');
            setEditWebsiteUrl(photographer.websiteUrl || '');
            setEditReviewUrl(photographer.reviewUrl || '');
            setEditWhatsappNumber(photographer.whatsappNumber || '');
            setEditStudioSlug(photographer.studioSlug || '');
            setEditCustomDomain(photographer.customDomain || '');
        }
    }, [photographer]);

    // Validate website URL format
    const validateWebsiteUrl = (url: string): boolean => {
        if (!url.trim()) return true; // Empty is valid (optional field)
        const pattern = /^https?:\/\/.+/i;
        return pattern.test(url);
    };

    const handleWebsiteUrlChange = (value: string) => {
        setEditWebsiteUrl(value);
        if (value.trim() && !validateWebsiteUrl(value)) {
            setWebsiteUrlError('URL must start with http:// or https://');
        } else {
            setWebsiteUrlError('');
        }
    };

    // Validate studio slug format
    const validateStudioSlug = (slug: string): boolean => {
        if (!slug.trim()) return true; // Empty is valid (optional)
        const pattern = /^[a-z0-9-]+$/;
        return pattern.test(slug) && slug.length >= 3 && slug.length <= 50;
    };

    const handleStudioSlugChange = (value: string) => {
        const normalized = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
        setEditStudioSlug(normalized);
        if (normalized && !validateStudioSlug(normalized)) {
            setStudioSlugError('Use lowercase letters, numbers, and hyphens only (3-50 chars)');
        } else {
            setStudioSlugError('');
        }
    };

    const handleSaveSettings = async () => {
        if (!editName.trim()) {
            toast.error('Name is required');
            return;
        }

        if (editWebsiteUrl.trim() && !validateWebsiteUrl(editWebsiteUrl)) {
            toast.error('Please enter a valid website URL');
            return;
        }

        setIsSaving(true);
        try {
            await authApi.updateProfile({
                name: editName.trim(),
                businessName: editBusinessName.trim() || undefined,
                logoUrl: editLogoUrl.trim() || null,
                websiteUrl: editWebsiteUrl.trim() || null,
                reviewUrl: editReviewUrl.trim() || null,
                whatsappNumber: editWhatsappNumber.trim() || null,
                studioSlug: editStudioSlug.trim() || null,
                customDomain: editCustomDomain.trim().toLowerCase() || null,
            });
            toast.success('Branding updated');
            setIsSettingsOpen(false);
            // Refresh user data
            refreshUser();
        } catch (error: any) {
            toast.error(error.message || 'Failed to update branding');
        } finally {
            setIsSaving(false);
        }
    };

    if (authLoading || !photographer) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Skeleton className="h-8 w-32" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="border-b">
                <div className="container mx-auto px-4 py-4 flex items-center justify-between">
                    <div>
                        <h1 className="font-bold text-xl">Client Gallery</h1>
                        <p className="text-sm text-muted-foreground">
                            {photographer.businessName || photographer.name}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline">Branding</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Studio Branding</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="edit-name">Your Name *</Label>
                                        <Input
                                            id="edit-name"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            placeholder="John Doe"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="edit-business">Studio / Business Name</Label>
                                        <Input
                                            id="edit-business"
                                            value={editBusinessName}
                                            onChange={(e) => setEditBusinessName(e.target.value)}
                                            placeholder="Doe Photography"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            This appears on client gallery pages
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="edit-logo">Logo URL</Label>
                                        <Input
                                            id="edit-logo"
                                            value={editLogoUrl}
                                            onChange={(e) => setEditLogoUrl(e.target.value)}
                                            placeholder="https://..."
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Direct link to your logo image (will appear as a circle)
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="edit-website">Studio Website URL</Label>
                                        <Input
                                            id="edit-website"
                                            value={editWebsiteUrl}
                                            onChange={(e) => handleWebsiteUrlChange(e.target.value)}
                                            placeholder="https://www.mybabypictures.in"
                                            className={websiteUrlError ? 'border-red-500' : ''}
                                        />
                                        {websiteUrlError ? (
                                            <p className="text-xs text-red-500">{websiteUrlError}</p>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">
                                                Optional. Your logo will link to this website on client galleries.
                                            </p>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="edit-review">Review URL (Google Maps)</Label>
                                        <Input
                                            id="edit-review"
                                            value={editReviewUrl}
                                            onChange={(e) => setEditReviewUrl(e.target.value)}
                                            placeholder="https://g.page/r/..."
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Link to write a review. Enables the "Recommend" CTA.
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="edit-whatsapp">WhatsApp Number</Label>
                                        <Input
                                            id="edit-whatsapp"
                                            value={editWhatsappNumber}
                                            onChange={(e) => setEditWhatsappNumber(e.target.value)}
                                            placeholder="919876543210"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Include country code (e.g. 91 for India). Used for "Prints" &amp; "Share" inquiries.
                                        </p>
                                    </div>

                                    {/* Divider for URL Settings */}
                                    <div className="border-t pt-4 mt-4">
                                        <h4 className="font-medium text-sm mb-3">Gallery URL Settings</h4>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="edit-studio-slug">Studio Slug</Label>
                                        <Input
                                            id="edit-studio-slug"
                                            value={editStudioSlug}
                                            onChange={(e) => handleStudioSlugChange(e.target.value)}
                                            placeholder="mybabypictures"
                                            className={studioSlugError ? 'border-red-500' : ''}
                                        />
                                        {studioSlugError ? (
                                            <p className="text-xs text-red-500">{studioSlugError}</p>
                                        ) : (
                                            <div className="text-xs text-muted-foreground space-y-1">
                                                <p>Your unique studio identifier for gallery URLs.</p>
                                                {editStudioSlug && (
                                                    <p className="font-mono text-emerald-600 dark:text-emerald-400">
                                                        pickal-tan.vercel.app/<strong>{editStudioSlug}</strong>/g/gallery-name
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="edit-custom-domain">Custom Domain (Optional)</Label>
                                        <Input
                                            id="edit-custom-domain"
                                            value={editCustomDomain}
                                            onChange={(e) => setEditCustomDomain(e.target.value.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, ''))}
                                            placeholder="gallery.mybabypictures.in"
                                        />
                                        <div className="text-xs text-muted-foreground space-y-1">
                                            <p>Point your domain's CNAME to <code className="bg-gray-100 px-1 rounded">cname.vercel-dns.com</code></p>
                                            {editCustomDomain && (
                                                <p className="font-mono text-emerald-600 dark:text-emerald-400">
                                                    <strong>{editCustomDomain}</strong>/g/gallery-name
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Preview */}
                                    {(editLogoUrl || editBusinessName || editName) && (
                                        <div className="border rounded-lg p-4 bg-gray-900 flex flex-col items-center">
                                            <p className="text-xs text-gray-400 mb-2">Preview</p>
                                            {editLogoUrl ? (
                                                <img
                                                    src={editLogoUrl}
                                                    alt="Logo preview"
                                                    className="w-12 h-12 rounded-full object-cover mb-2 border border-white/20"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                    }}
                                                />
                                            ) : (
                                                <div className="w-12 h-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mb-2">
                                                    <span className="text-sm font-medium text-white/80">
                                                        {(editBusinessName || editName)
                                                            .split(' ')
                                                            .map(word => word[0])
                                                            .join('')
                                                            .slice(0, 2)
                                                            .toUpperCase()}
                                                    </span>
                                                </div>
                                            )}
                                            <span className="text-xs tracking-wide uppercase text-white/70">
                                                {editBusinessName || editName}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button onClick={handleSaveSettings} disabled={isSaving || !editName.trim()}>
                                        {isSaving ? 'Saving...' : 'Save Branding'}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                        <Button variant="outline" asChild>
                            <Link href="/dashboard/print-requests">Print Requests</Link>
                        </Button>
                        <Button variant="ghost" onClick={logout}>
                            Sign Out
                        </Button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-4 py-8">
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl font-bold">Your Galleries</h2>
                    <Button asChild>
                        <Link href="/dashboard/galleries/new">Create Gallery</Link>
                    </Button>
                </div>

                {isLoading ? (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map((i) => (
                            <Card key={i}>
                                <CardHeader>
                                    <Skeleton className="h-6 w-3/4" />
                                    <Skeleton className="h-4 w-1/2" />
                                </CardHeader>
                                <CardContent>
                                    <Skeleton className="h-4 w-full" />
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : galleries.length === 0 ? (
                    <Card className="text-center py-12">
                        <CardContent>
                            <div className="space-y-4">
                                <div className="text-6xl">📷</div>
                                <h3 className="text-xl font-semibold">No galleries yet</h3>
                                <p className="text-muted-foreground">
                                    Create your first gallery to start sharing photos with clients
                                </p>
                                <Button asChild>
                                    <Link href="/dashboard/galleries/new">Create Gallery</Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {galleries.map((gallery) => (
                            <Link key={gallery.id} href={`/dashboard/galleries/${gallery.id}`}>
                                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                                    <CardHeader>
                                        <div className="flex items-start justify-between">
                                            <CardTitle className="line-clamp-1">{gallery.name}</CardTitle>
                                            <Badge variant={gallery.selectionState === 'OPEN' ? 'default' : 'secondary'}>
                                                {gallery.selectionState === 'OPEN' ? 'Selecting' : gallery.selectionState.toLowerCase()}
                                            </Badge>
                                        </div>
                                        <CardDescription className="line-clamp-2">
                                            {gallery.description || 'No description'}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                            <span>{gallery._count?.photos || 0} photos</span>
                                            <span>•</span>
                                            <span>{gallery._count?.primaryClients || 0} clients</span>
                                            {gallery.downloadsEnabled && (
                                                <>
                                                    <span>•</span>
                                                    <span className="text-green-600 dark:text-green-400">Downloads on</span>
                                                </>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
