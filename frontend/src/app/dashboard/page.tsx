'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { galleryApi, Gallery } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

export default function DashboardPage() {
    const { photographer, isLoading: authLoading, logout } = useAuth();
    const [galleries, setGalleries] = useState<Gallery[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

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
        }
    }, [photographer]);

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
