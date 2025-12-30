'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { galleryApi, faceApi, setSessionToken } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

type AccessScreen = 'entry' | 'selfie' | 'private-key' | 'processing';

export default function GalleryAccessPage() {
    const params = useParams();
    const router = useRouter();
    const galleryId = params.id as string;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    // Screen state
    const [screen, setScreen] = useState<AccessScreen>('entry');

    // Form states
    const [privateKey, setPrivateKey] = useState('');
    const [clientName, setClientName] = useState('');
    const [selfieFile, setSelfieFile] = useState<File | null>(null);
    const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
    const [consentChecked, setConsentChecked] = useState(false);
    const [mobileNumber, setMobileNumber] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Processing state
    const [progress, setProgress] = useState(0);
    const [galleryName, setGalleryName] = useState('Gallery');

    // Simulate progress during processing
    useEffect(() => {
        if (screen === 'processing') {
            const interval = setInterval(() => {
                setProgress(prev => {
                    if (prev >= 90) {
                        clearInterval(interval);
                        return prev;
                    }
                    return prev + Math.random() * 15;
                });
            }, 300);
            return () => clearInterval(interval);
        }
    }, [screen]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelfieFile(file);
            const reader = new FileReader();
            reader.onload = () => setSelfiePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

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

    const handleSelfieSubmit = async () => {
        if (!selfieFile || !consentChecked) return;

        setScreen('processing');
        setProgress(0);

        try {
            const result = await faceApi.guestAccess(galleryId, mobileNumber, selfieFile);
            setSessionToken(result.sessionToken);
            setGalleryName(result.gallery.name);
            setProgress(100);

            // Store selfie preview for gallery display
            if (selfiePreview) {
                sessionStorage.setItem('guest_selfie_preview', selfiePreview);
                sessionStorage.setItem('guest_matched_count', result.matchedCount.toString());
            }

            // Short delay to show 100% before redirecting
            setTimeout(() => {
                if (result.matchedCount === 0) {
                    toast.info('No photos found matching your face. You may want to try a different selfie.');
                } else {
                    toast.success(`Found ${result.matchedCount} photos of you!`);
                }
                router.push(`/g/${galleryId}`);
            }, 500);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to process selfie');
            setScreen('selfie');
        }
    };

    // =========================================================================
    // ENTRY SCREEN
    // =========================================================================
    const renderEntryScreen = () => (
        <div className="w-full max-w-md mx-auto">
            <div className="bg-white rounded-2xl shadow-xl p-8">
                {/* Lock Icon */}
                <div className="flex justify-center mb-6">
                    <div className="w-14 h-14 bg-rose-50 rounded-xl flex items-center justify-center">
                        <svg className="w-7 h-7 text-[#8B1538]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                </div>

                {/* Heading */}
                <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
                    How would you like to access the gallery?
                </h1>
                <p className="text-center text-gray-500 mb-8">
                    Choose an option below to securely view your photos from the event.
                </p>

                {/* Primary CTA - Selfie */}
                <button
                    onClick={() => setScreen('selfie')}
                    className="w-full bg-[#8B1538] hover:bg-[#7a1230] text-white rounded-xl py-4 px-6 flex items-center justify-center gap-3 transition-colors mb-3"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <span className="font-semibold">Find my photos using a selfie</span>
                </button>
                <p className="text-center text-gray-500 text-sm mb-6">
                    The fastest way. We use facial recognition to find only your photos.
                </p>

                {/* Divider */}
                <div className="flex items-center gap-4 mb-6">
                    <div className="flex-1 h-px bg-gray-200"></div>
                    <span className="text-gray-400 text-sm">OR</span>
                    <div className="flex-1 h-px bg-gray-200"></div>
                </div>

                {/* Secondary CTA - Private Key */}
                <button
                    onClick={() => setScreen('private-key')}
                    className="w-full bg-white border-2 border-gray-200 hover:border-gray-300 text-gray-700 rounded-xl py-4 px-6 flex items-center justify-center gap-3 transition-colors mb-3"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    <span className="font-semibold">I have the private key</span>
                </button>
                <p className="text-center text-gray-500 text-sm mb-8">
                    Enter the unique 6-digit code found on your invitation card.
                </p>

                {/* Privacy Notice */}
                <div className="flex items-center justify-center gap-2 text-sm text-emerald-600">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span>Your privacy is protected. Photos are never shared publicly.</span>
                </div>
            </div>

            {/* Footer Links */}
            <div className="flex justify-center gap-6 mt-8 text-sm text-gray-500">
                <a href="#" className="hover:text-gray-700 transition-colors">Privacy Policy</a>
                <a href="#" className="hover:text-gray-700 transition-colors">Terms of Service</a>
            </div>
        </div>
    );

    // =========================================================================
    // PRIVATE KEY SCREEN
    // =========================================================================
    const renderPrivateKeyScreen = () => (
        <div className="w-full max-w-md mx-auto">
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center px-4 py-4 border-b border-gray-100">
                    <button
                        onClick={() => setScreen('entry')}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <h2 className="flex-1 text-center font-semibold text-gray-900 pr-8">Gallery Access</h2>
                </div>

                <form onSubmit={handlePrivateKeyAccess} className="p-6 space-y-6">
                    <div className="text-center mb-6">
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">Enter Your Private Key</h1>
                        <p className="text-gray-500">Found on your invitation card or shared by the photographer.</p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="privateKey">Access Key</Label>
                        <Input
                            id="privateKey"
                            type="text"
                            placeholder="Enter your access key"
                            value={privateKey}
                            onChange={(e) => setPrivateKey(e.target.value)}
                            required
                            className="font-mono text-center text-lg tracking-widest h-14"
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
                            className="h-12"
                        />
                    </div>

                    <Button
                        type="submit"
                        disabled={isLoading || !privateKey}
                        className="w-full h-14 bg-[#8B1538] hover:bg-[#7a1230] text-white font-semibold rounded-xl"
                    >
                        {isLoading ? 'Verifying...' : 'Access Gallery'}
                    </Button>
                </form>
            </div>
        </div>
    );

    // =========================================================================
    // SELFIE UPLOAD SCREEN
    // =========================================================================
    const renderSelfieScreen = () => (
        <div className="w-full max-w-md mx-auto">
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center px-4 py-4 border-b border-gray-100">
                    <button
                        onClick={() => setScreen('entry')}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <h2 className="flex-1 text-center font-semibold text-gray-900 pr-8">Gallery Access</h2>
                </div>

                <div className="p-6">
                    {/* Title */}
                    <div className="text-center mb-6">
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">Find Your Moments</h1>
                        <p className="text-gray-500">
                            Upload a selfie to instantly identify and retrieve your photos from the event gallery.
                        </p>
                    </div>

                    {/* Upload Zone */}
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="relative border-2 border-dashed border-gray-300 rounded-xl p-8 mb-4 cursor-pointer hover:border-gray-400 transition-colors"
                    >
                        {selfiePreview ? (
                            <div className="flex flex-col items-center">
                                <img
                                    src={selfiePreview}
                                    alt="Selfie preview"
                                    className="w-32 h-32 object-cover rounded-xl"
                                />
                                <p className="text-sm text-gray-500 mt-3">Tap to change photo</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center">
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                    <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <p className="text-sm text-gray-500 uppercase tracking-wide">Tap to add photo</p>
                            </div>
                        )}

                        {/* Lighting Tip Badge */}
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                            <span>🌟</span>
                            <span>Ensure good lighting</span>
                        </div>
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                    <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="user"
                        onChange={handleFileChange}
                        className="hidden"
                    />

                    {/* Instruction Text */}
                    <p className="text-center text-gray-500 text-sm mb-6">
                        Make sure your face is clearly visible without sunglasses or hats for the best results.
                    </p>

                    {/* Camera/Gallery Buttons */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <button
                            onClick={() => cameraInputRef.current?.click()}
                            className="flex flex-col items-center justify-center py-4 border-2 border-gray-200 rounded-xl hover:border-gray-300 transition-colors"
                        >
                            <svg className="w-6 h-6 text-gray-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="text-sm font-medium text-gray-700">Use Camera</span>
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex flex-col items-center justify-center py-4 border-2 border-gray-200 rounded-xl hover:border-gray-300 transition-colors"
                        >
                            <svg className="w-6 h-6 text-gray-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="text-sm font-medium text-gray-700">Gallery</span>
                        </button>
                    </div>

                    {/* Mobile Number Input */}
                    <div className="mb-6">
                        <Label htmlFor="mobileNumber" className="text-sm font-medium text-gray-700 mb-2 block">
                            Mobile Number
                        </Label>
                        <div className="relative">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <Input
                                id="mobileNumber"
                                type="tel"
                                placeholder="+1 (555) 000-0000"
                                value={mobileNumber}
                                onChange={(e) => setMobileNumber(e.target.value)}
                                className="pl-12 h-12 text-gray-700"
                            />
                        </div>
                    </div>

                    {/* Consent Checkbox */}
                    <div className="flex items-start gap-3 mb-6 p-4 bg-gray-50 rounded-xl">
                        <Checkbox
                            id="consent"
                            checked={consentChecked}
                            onCheckedChange={(checked) => setConsentChecked(checked as boolean)}
                            className="mt-0.5"
                        />
                        <div className="flex-1">
                            <label htmlFor="consent" className="text-sm text-gray-600 cursor-pointer">
                                I consent to the use of facial recognition technology to process my photo and find matches in this gallery.{' '}
                                <a href="#" className="text-[#8B1538] hover:underline">Privacy Policy</a>.
                            </label>
                        </div>
                        <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>

                    {/* Submit Button */}
                    <button
                        onClick={handleSelfieSubmit}
                        disabled={!selfieFile || !consentChecked}
                        className="w-full bg-[#8B1538] hover:bg-[#7a1230] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
                    >
                        <span>Find My Photos</span>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );

    // =========================================================================
    // PROCESSING SCREEN
    // =========================================================================
    const renderProcessingScreen = () => (
        <div className="w-full max-w-md mx-auto">
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <span className="text-[#8B1538]">✦</span>
                        <span className="font-semibold text-gray-900">{galleryName}</span>
                    </div>
                    <button
                        onClick={() => setScreen('selfie')}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-8 pb-12">
                    {/* Selfie Preview with Scan Indicator */}
                    <div className="flex justify-center mb-8">
                        <div className="relative">
                            <div className="w-36 h-36 rounded-2xl overflow-hidden border-4 border-gray-100 shadow-lg">
                                {selfiePreview ? (
                                    <img
                                        src={selfiePreview}
                                        alt="Your selfie"
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-gradient-to-br from-rose-100 to-rose-200 flex items-center justify-center">
                                        <svg className="w-12 h-12 text-rose-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                )}
                            </div>
                            {/* Scan Icon */}
                            <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-rose-50 rounded-full flex items-center justify-center border-4 border-white shadow">
                                <svg className="w-5 h-5 text-[#8B1538] animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* Status Text */}
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">Finding your photos...</h1>
                        <p className="text-gray-500">We are scanning the gallery for your smile.</p>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-3">
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-[#8B1538] rounded-full transition-all duration-300 ease-out"
                                style={{ width: `${Math.min(progress, 100)}%` }}
                            />
                        </div>
                    </div>

                    {/* Progress Label */}
                    <div className="flex justify-between items-center mb-8">
                        <span className="text-sm font-semibold text-[#8B1538] uppercase tracking-wide">Scanning</span>
                        <span className="text-sm text-gray-500">{Math.round(Math.min(progress, 100))}%</span>
                    </div>

                    {/* Helper Text */}
                    <p className="text-center text-gray-400 text-sm">
                        This typically takes just a few seconds. Sit tight while we match your selfie with thousands of moments.
                    </p>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-center gap-2 py-4 border-t border-gray-100 text-gray-500 text-sm">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>Private & Secure Gallery</span>
                </div>
            </div>
        </div>
    );

    // =========================================================================
    // MAIN RENDER
    // =========================================================================
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 via-gray-50 to-rose-50 p-4">
            {/* Header */}
            <div className="fixed top-0 left-0 right-0 flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-sm border-b border-gray-100 z-10">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-[#8B1538] rounded-lg flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <span className="font-semibold text-gray-900">Lumina Gallery</span>
                </div>
                <a href="#" className="text-gray-500 hover:text-gray-700 text-sm">Help</a>
            </div>

            {/* Screen Content */}
            <div className="w-full pt-20">
                {screen === 'entry' && renderEntryScreen()}
                {screen === 'private-key' && renderPrivateKeyScreen()}
                {screen === 'selfie' && renderSelfieScreen()}
                {screen === 'processing' && renderProcessingScreen()}
            </div>
        </div>
    );
}
