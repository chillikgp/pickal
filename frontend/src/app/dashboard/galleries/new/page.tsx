'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { galleryApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export default function NewGalleryPage() {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [eventDate, setEventDate] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const { gallery } = await galleryApi.create({
                name,
                description: description || undefined,
                eventDate: eventDate ? new Date(eventDate).toISOString() : undefined,
            });
            toast.success('Gallery created!');
            router.push(`/dashboard/galleries/${gallery.id}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to create gallery');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="border-b">
                <div className="container mx-auto px-4 py-4">
                    <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
                        ← Back to Dashboard
                    </Link>
                </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-4 py-8 max-w-xl">
                <Card>
                    <CardHeader>
                        <CardTitle>Create New Gallery</CardTitle>
                        <CardDescription>
                            Set up a new photo gallery for your clients
                        </CardDescription>
                    </CardHeader>
                    <form onSubmit={handleSubmit}>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Gallery Name *</Label>
                                <Input
                                    id="name"
                                    placeholder="Wedding of John & Jane"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Input
                                    id="description"
                                    placeholder="Beautiful summer wedding at Central Park"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="eventDate">Event Date</Label>
                                <Input
                                    id="eventDate"
                                    type="date"
                                    value={eventDate}
                                    onChange={(e) => setEventDate(e.target.value)}
                                />
                            </div>

                            <div className="pt-4">
                                <Button type="submit" className="w-full" disabled={isLoading}>
                                    {isLoading ? 'Creating...' : 'Create Gallery'}
                                </Button>
                            </div>
                        </CardContent>
                    </form>
                </Card>
            </main>
        </div>
    );
}
