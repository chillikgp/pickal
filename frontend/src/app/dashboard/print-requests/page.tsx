'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { printApi, galleryApi, PrintRequest, Gallery, API_URL } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

export default function PrintRequestsPage() {
    const { photographer, isLoading: authLoading } = useAuth();
    const router = useRouter();

    const [galleries, setGalleries] = useState<Gallery[]>([]);
    const [printRequests, setPrintRequests] = useState<Record<string, PrintRequest[]>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [activeGallery, setActiveGallery] = useState<string>('all');

    useEffect(() => {
        if (!authLoading && !photographer) {
            router.push('/login');
        }
    }, [authLoading, photographer, router]);

    const loadData = useCallback(async () => {
        if (!photographer) return;

        try {
            const { galleries: galleriesList } = await galleryApi.list();
            setGalleries(galleriesList);

            // Load print requests for each gallery
            const requestsByGallery: Record<string, PrintRequest[]> = {};
            for (const gallery of galleriesList) {
                try {
                    const { printRequests: requests } = await printApi.getByGallery(gallery.id);
                    if (requests.length > 0) {
                        requestsByGallery[gallery.id] = requests;
                    }
                } catch (e) {
                    // Skip galleries with errors
                }
            }
            setPrintRequests(requestsByGallery);

            // Set active gallery to first one with requests
            const firstGalleryWithRequests = Object.keys(requestsByGallery)[0];
            if (firstGalleryWithRequests) {
                setActiveGallery(firstGalleryWithRequests);
            }
        } catch (error) {
            toast.error('Failed to load print requests');
        } finally {
            setIsLoading(false);
        }
    }, [photographer]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleUpdateStatus = async (requestId: string, status: 'APPROVED' | 'REJECTED') => {
        try {
            await printApi.update(requestId, { status });
            toast.success(`Request ${status.toLowerCase()}`);
            loadData();
        } catch (error) {
            toast.error('Failed to update request');
        }
    };

    // Get all requests or filtered by gallery
    const filteredRequests = activeGallery === 'all'
        ? Object.values(printRequests).flat()
        : printRequests[activeGallery] || [];

    const pendingCount = filteredRequests.filter(r => r.status === 'PENDING').length;
    const approvedCount = filteredRequests.filter(r => r.status === 'APPROVED').length;
    const rejectedCount = filteredRequests.filter(r => r.status === 'REJECTED').length;

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
                <div className="container mx-auto px-4 py-4">
                    <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
                        ← Dashboard
                    </Link>
                    <h1 className="font-bold text-xl">Print Requests</h1>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8">
                {isLoading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-32 w-full" />
                        <Skeleton className="h-32 w-full" />
                    </div>
                ) : Object.keys(printRequests).length === 0 ? (
                    <Card className="text-center py-12">
                        <CardContent>
                            <div className="space-y-4">
                                <div className="text-6xl">🖨️</div>
                                <h3 className="text-xl font-semibold">No print requests yet</h3>
                                <p className="text-muted-foreground">
                                    Print requests from your clients will appear here
                                </p>
                                <Button asChild variant="outline">
                                    <Link href="/dashboard">Back to Dashboard</Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-4 mb-8">
                            <Card>
                                <CardContent className="pt-4">
                                    <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
                                    <div className="text-sm text-muted-foreground">Pending</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-4">
                                    <div className="text-2xl font-bold text-green-600">{approvedCount}</div>
                                    <div className="text-sm text-muted-foreground">Approved</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-4">
                                    <div className="text-2xl font-bold text-red-600">{rejectedCount}</div>
                                    <div className="text-sm text-muted-foreground">Rejected</div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Gallery Filter */}
                        <Tabs value={activeGallery} onValueChange={setActiveGallery} className="mb-6">
                            <TabsList className="flex-wrap h-auto">
                                <TabsTrigger value="all">All Galleries</TabsTrigger>
                                {Object.keys(printRequests).map((galleryId) => {
                                    const gallery = galleries.find(g => g.id === galleryId);
                                    return (
                                        <TabsTrigger key={galleryId} value={galleryId}>
                                            {gallery?.name || 'Unknown'} ({printRequests[galleryId].length})
                                        </TabsTrigger>
                                    );
                                })}
                            </TabsList>
                        </Tabs>

                        {/* Request List */}
                        <div className="space-y-4">
                            {filteredRequests.length === 0 ? (
                                <Card className="text-center py-8">
                                    <CardContent>
                                        <p className="text-muted-foreground">No requests in this gallery</p>
                                    </CardContent>
                                </Card>
                            ) : (
                                filteredRequests.map((request) => {
                                    const gallery = galleries.find(g => g.id === request.photo?.id);
                                    return (
                                        <Card key={request.id}>
                                            <CardContent className="pt-6">
                                                <div className="flex flex-col md:flex-row gap-4">
                                                    {/* Photo Thumbnail */}
                                                    <div className="w-full md:w-24 h-24 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                                                        {request.photo?.webKey && (
                                                            <img
                                                                src={`${API_URL}/uploads/${request.photo.webKey}`}
                                                                alt={request.photo.filename}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        )}
                                                    </div>

                                                    {/* Request Details */}
                                                    <div className="flex-1 space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <span className="font-medium">{request.photo?.filename}</span>
                                                                <Badge className="ml-2" variant={
                                                                    request.status === 'PENDING' ? 'secondary' :
                                                                        request.status === 'APPROVED' ? 'default' : 'destructive'
                                                                }>
                                                                    {request.status}
                                                                </Badge>
                                                            </div>
                                                            <span className="text-sm text-muted-foreground">
                                                                {new Date(request.createdAt).toLocaleDateString()}
                                                            </span>
                                                        </div>

                                                        <div className="text-sm text-muted-foreground">
                                                            {request.primaryClient && (
                                                                <span>Client: {request.primaryClient.name || request.primaryClient.email}</span>
                                                            )}
                                                            {request.guest && (
                                                                <span>Guest: {request.guest.mobileNumber}</span>
                                                            )}
                                                        </div>

                                                        <div className="text-sm">
                                                            <span className="font-medium">Quantity:</span> {request.quantity}
                                                            {request.size && <span className="ml-4"><span className="font-medium">Size:</span> {request.size}</span>}
                                                        </div>

                                                        {request.notes && (
                                                            <div className="text-sm">
                                                                <span className="font-medium">Notes:</span> {request.notes}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Actions */}
                                                    {request.status === 'PENDING' && (
                                                        <div className="flex md:flex-col gap-2 flex-shrink-0">
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleUpdateStatus(request.id, 'APPROVED')}
                                                            >
                                                                Approve
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="destructive"
                                                                onClick={() => handleUpdateStatus(request.id, 'REJECTED')}
                                                            >
                                                                Reject
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })
                            )}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
