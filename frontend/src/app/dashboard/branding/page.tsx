'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi, Photographer } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';

export default function BrandingPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Form State
    const [formData, setFormData] = useState<Partial<Photographer>>({});
    const [hasChanges, setHasChanges] = useState(false);

    // Load initial data
    useEffect(() => {
        authApi.me()
            .then(({ photographer }) => {
                const data = {
                    name: photographer.name,
                    businessName: photographer.businessName,
                    logoUrl: photographer.logoUrl,
                    websiteUrl: photographer.websiteUrl,
                    reviewUrl: photographer.reviewUrl,
                    whatsappNumber: photographer.whatsappNumber,
                    studioSlug: photographer.studioSlug,
                    customDomain: photographer.customDomain,
                };
                setFormData(data);
                setIsLoading(false);
            })
            .catch(() => {
                toast.error('Failed to load branding settings');
                router.push('/dashboard');
            });
    }, [router]);

    // Value change handler
    const handleChange = (field: keyof Photographer, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setHasChanges(true);
    };

    // Auto-save logic
    useEffect(() => {
        if (!hasChanges || isLoading) return;

        const timer = setTimeout(async () => {
            setIsSaving(true);
            try {
                // Helper to normalize empty strings to null
                const normalize = (value?: string | null) => {
                    return !value || value.trim() === '' ? null : value.trim();
                };

                const cleanData: Partial<Photographer> = {
                    name: formData.name,
                    businessName: formData.businessName,
                    logoUrl: normalize(formData.logoUrl),
                    websiteUrl: normalize(formData.websiteUrl),
                    reviewUrl: normalize(formData.reviewUrl),
                    whatsappNumber: normalize(formData.whatsappNumber),
                    studioSlug: normalize(formData.studioSlug),
                    customDomain: normalize(formData.customDomain),
                };

                await authApi.updateProfile(cleanData);
                setHasChanges(false);
            } catch (error) {
                toast.error('Failed to save changes');
            } finally {
                setIsSaving(false);
            }
        }, 1000); // 1 second debounce

        return () => clearTimeout(timer);
    }, [formData, hasChanges, isLoading]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background p-8">
                <div className="max-w-4xl mx-auto space-y-8">
                    <div className="flex items-center gap-4">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="space-y-2">
                            <Skeleton className="h-8 w-48" />
                            <Skeleton className="h-4 w-32" />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background pb-20">
            {/* Header */}
            <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
                <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="sm" asChild className="-ml-2">
                            <Link href="/dashboard">← Back</Link>
                        </Button>
                        <div className="h-6 w-px bg-border" />
                        <div>
                            <h1 className="font-semibold text-lg leading-none">Studio Branding</h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {isSaving ? (
                            <span className="text-xs text-muted-foreground animate-pulse">Saving...</span>
                        ) : !hasChanges ? (
                            <span className="text-xs text-muted-foreground">Saved</span>
                        ) : (
                            <span className="text-xs text-orange-500">Unsaved changes...</span>
                        )}
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-8">
                <Tabs defaultValue="identity" className="space-y-8">
                    <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
                        <TabsTrigger value="identity">Identity</TabsTrigger>
                        <TabsTrigger value="client">Client Actions</TabsTrigger>
                        <TabsTrigger value="advanced">Advanced</TabsTrigger>
                    </TabsList>

                    {/* IDENTITY TAB */}
                    <TabsContent value="identity" className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Visual Identity</CardTitle>
                                <CardDescription>
                                    Set how your studio appears on gallery pages.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="name">Your Name</Label>
                                    <Input
                                        id="name"
                                        value={formData.name || ''}
                                        onChange={(e) => handleChange('name', e.target.value)}
                                        placeholder="e.g. Saurav Sahu"
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="businessName">Studio / Business Name</Label>
                                    <Input
                                        id="businessName"
                                        value={formData.businessName || ''}
                                        onChange={(e) => handleChange('businessName', e.target.value)}
                                        placeholder="e.g. My Baby Photos"
                                    />
                                    <p className="text-[10px] text-muted-foreground">Appears on client gallery pages.</p>
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="logoUrl">Logo URL</Label>
                                    <div className="flex gap-4 items-start">
                                        <div className="flex-1">
                                            <Input
                                                id="logoUrl"
                                                value={formData.logoUrl || ''}
                                                onChange={(e) => handleChange('logoUrl', e.target.value)}
                                                placeholder="https://..."
                                            />
                                            <p className="text-[10px] text-muted-foreground mt-1.5">
                                                Direct link to your logo image.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="websiteUrl">Studio Website</Label>
                                    <Input
                                        id="websiteUrl"
                                        value={formData.websiteUrl || ''}
                                        onChange={(e) => handleChange('websiteUrl', e.target.value)}
                                        placeholder="https://yourwebsite.com"
                                    />
                                    <p className="text-[10px] text-muted-foreground">
                                        Clicking your logo will take clients here.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* CLIENT ACTIONS TAB */}
                    <TabsContent value="client" className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Client Engagement</CardTitle>
                                <CardDescription>
                                    How clients can contact you or leave reviews.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid gap-2">
                                    <Label htmlFor="whatsapp" className="flex items-center gap-2">
                                        {/* WhatsApp Icon */}
                                        <svg className="w-4 h-4 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.884-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                                        WhatsApp Number
                                    </Label>
                                    <Input
                                        id="whatsapp"
                                        value={formData.whatsappNumber || ''}
                                        onChange={(e) => handleChange('whatsappNumber', e.target.value)}
                                        placeholder="919876543210"
                                    />
                                    <p className="text-[10px] text-muted-foreground">
                                        Include country code (e.g. 91). Used for "Prints" & "Share" inquiries.
                                    </p>
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="review" className="flex items-center gap-2">
                                        Review URL (Google Maps)
                                    </Label>
                                    <Input
                                        id="review"
                                        value={formData.reviewUrl || ''}
                                        onChange={(e) => handleChange('reviewUrl', e.target.value)}
                                        placeholder="https://g.page/r/..."
                                    />
                                    <p className="text-[10px] text-muted-foreground">
                                        Enables the "Recommend" CTA on galleries.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ADVANCED / URLS TAB */}
                    <TabsContent value="advanced" className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Gallery URLs</CardTitle>
                                <CardDescription>
                                    Advanced configuration for your gallery links.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid gap-2">
                                    <Label htmlFor="slug">Studio Slug</Label>
                                    <Input
                                        id="slug"
                                        value={formData.studioSlug || ''}
                                        onChange={(e) => handleChange('studioSlug', e.target.value)}
                                        placeholder="my-studio"
                                    />
                                    <div className="bg-muted p-2 rounded text-xs break-all text-muted-foreground font-mono">
                                        pickal-tan.vercel.app/<span className="text-foreground font-medium">{formData.studioSlug || 'your-slug'}</span>/g/gallery-name
                                    </div>
                                </div>

                                <div className="grid gap-2 pt-4 border-t">
                                    <Label htmlFor="domain">Custom Domain (Optional)</Label>
                                    <Input
                                        id="domain"
                                        value={formData.customDomain || ''}
                                        onChange={(e) => handleChange('customDomain', e.target.value)}
                                        placeholder="gallery.mystudio.com"
                                    />
                                    <div className="bg-muted p-2 rounded text-xs break-all text-muted-foreground font-mono space-y-1">
                                        <div>
                                            <span className="text-foreground font-medium">{formData.customDomain || 'domain.com'}</span>/g/gallery-name
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">
                                        Requires CNAME configuration.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

                {/* UNIFIED PREVIEW CARD */}
                <div className="mt-8 border rounded-xl overflow-hidden bg-background shadow-sm">
                    <div className="bg-muted px-4 py-2 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Live Preview
                    </div>
                    <div className="p-8 flex flex-col items-center justify-center text-center space-y-4 bg-muted/10">
                        <Avatar className="w-20 h-20 border-2 border-background shadow-sm">
                            <AvatarImage src={formData.logoUrl} />
                            <AvatarFallback>{formData.businessName?.substring(0, 2).toUpperCase() || 'ST'}</AvatarFallback>
                        </Avatar>
                        <div>
                            <h3 className="text-lg font-bold">
                                {formData.businessName || 'Your Studio Name'}
                            </h3>
                            {formData.name && (
                                <p className="text-sm text-muted-foreground mt-1">
                                    by {formData.name}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
