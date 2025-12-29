'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { galleryApi, setSessionToken } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

export default function GalleryAccessPage() {
    const params = useParams();
    const router = useRouter();
    const galleryId = params.id as string;

    const [privateKey, setPrivateKey] = useState('');
    const [clientName, setClientName] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handlePrivateKeyAccess = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const result = await galleryApi.access(galleryId, {
                privateKey,
                clientName: clientName || undefined,
            });
            setSessionToken(result.sessionToken);
            toast.success(`Welcome to ${result.gallery.name}!`);
            router.push(`/g/${galleryId}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Invalid access key');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-neutral-950 dark:to-neutral-900 p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">Access Gallery</CardTitle>
                    <CardDescription>
                        Enter your access key or take a selfie to find your photos
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="key">
                        <TabsList className="w-full">
                            <TabsTrigger value="key" className="flex-1">Access Key</TabsTrigger>
                            <TabsTrigger value="selfie" className="flex-1">Find My Photos</TabsTrigger>
                        </TabsList>

                        <TabsContent value="key" className="pt-4">
                            <form onSubmit={handlePrivateKeyAccess} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="privateKey">Access Key</Label>
                                    <Input
                                        id="privateKey"
                                        type="text"
                                        placeholder="Paste your access key"
                                        value={privateKey}
                                        onChange={(e) => setPrivateKey(e.target.value)}
                                        required
                                        className="font-mono"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="clientName">Your Name (optional)</Label>
                                    <Input
                                        id="clientName"
                                        type="text"
                                        placeholder="Your name"
                                        value={clientName}
                                        onChange={(e) => setClientName(e.target.value)}
                                    />
                                </div>
                                <Button type="submit" className="w-full" disabled={isLoading}>
                                    {isLoading ? 'Verifying...' : 'Access Gallery'}
                                </Button>
                            </form>
                        </TabsContent>

                        <TabsContent value="selfie" className="pt-4">
                            <div className="text-center space-y-4">
                                <div className="text-6xl">📸</div>
                                <p className="text-muted-foreground">
                                    Take a selfie to find all photos you appear in
                                </p>
                                <Button
                                    className="w-full"
                                    onClick={() => router.push(`/g/${galleryId}/selfie`)}
                                >
                                    Take a Selfie
                                </Button>
                            </div>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}
