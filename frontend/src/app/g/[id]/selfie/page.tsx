'use client';

import { useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { faceApi, setSessionToken } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export default function SelfieAccessPage() {
    const params = useParams();
    const router = useRouter();
    const galleryId = params.id as string;
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [mobileNumber, setMobileNumber] = useState('');
    const [selfieFile, setSelfieFile] = useState<File | null>(null);
    const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelfieFile(file);
            const reader = new FileReader();
            reader.onload = () => setSelfiePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selfieFile) {
            toast.error('Please select a selfie');
            return;
        }

        setIsLoading(true);

        try {
            const result = await faceApi.guestAccess(galleryId, mobileNumber, selfieFile);
            setSessionToken(result.sessionToken);

            // Store selfie preview in sessionStorage for display in gallery
            if (selfiePreview) {
                sessionStorage.setItem('guest_selfie_preview', selfiePreview);
                sessionStorage.setItem('guest_matched_count', result.matchedCount.toString());
            }

            if (result.matchedCount === 0) {
                toast.info('No photos found matching your face. You may want to try a different selfie.');
            } else {
                toast.success(`Found ${result.matchedCount} photos of you!`);
            }

            router.push(`/g/${galleryId}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to process selfie');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-neutral-950 dark:to-neutral-900 p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">Find Your Photos</CardTitle>
                    <CardDescription>
                        Upload a selfie to find all photos you appear in
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="mobile">Mobile Number</Label>
                            <Input
                                id="mobile"
                                type="tel"
                                placeholder="Your mobile number"
                                value={mobileNumber}
                                onChange={(e) => setMobileNumber(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Your Selfie</Label>
                            <div
                                className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {selfiePreview ? (
                                    <img
                                        src={selfiePreview}
                                        alt="Selfie preview"
                                        className="max-h-48 mx-auto rounded-lg"
                                    />
                                ) : (
                                    <div className="py-8">
                                        <div className="text-4xl mb-2">📷</div>
                                        <p className="text-muted-foreground">Click to upload selfie</p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            For best results, use a clear front-facing photo
                                        </p>
                                    </div>
                                )}
                            </div>
                            <Input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                capture="user"
                                onChange={handleFileChange}
                                className="hidden"
                            />
                        </div>

                        <Button type="submit" className="w-full" disabled={isLoading || !selfieFile}>
                            {isLoading ? 'Finding your photos...' : 'Find My Photos'}
                        </Button>

                        <p className="text-xs text-muted-foreground text-center">
                            Your selfie is used only to match faces in the gallery photos.
                            You&apos;ll only see photos you appear in.
                        </p>
                    </CardContent>
                </form>
            </Card>
        </div>
    );
}
