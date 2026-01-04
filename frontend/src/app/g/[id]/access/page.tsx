'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { galleryApi, faceApi, setSessionToken, studioApi } from '@/lib/api';
import { isCustomDomain, getNormalizedHost } from '@/lib/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

type AccessScreen = 'entry' | 'selfie' | 'private-key' | 'processing';

// Helper to check if a string is a valid UUID
const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

// Gallery config type from public-config endpoint
interface GalleryConfig {
    galleryId: string;
    galleryName: string;
    eventDate: string | null;
    coverPhotoUrl: string | null;
    selfieMatchingEnabled: boolean;
    downloadsEnabled: boolean;
    studio: {
        name: string;
        logoUrl: string | null;
        websiteUrl: string | null;
    };
}

export default function GalleryAccessPage() {
    const params = useParams();
    const router = useRouter();
    const urlParam = params.id as string;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    // Resolved gallery ID (always UUID after slug resolution)
    const [galleryId, setGalleryId] = useState<string | null>(null);

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

    // Gallery config (fetched on mount)
    const [config, setConfig] = useState<GalleryConfig | null>(null);
    const [configLoading, setConfigLoading] = useState(true);

    // Resolve slug to galleryId and fetch config
    useEffect(() => {
        const resolveAndFetchConfig = async () => {
            setConfigLoading(true);
            try {
                let resolvedId = urlParam;

                // Check if we're on a custom domain
                const customDomain = isCustomDomain();
                const host = getNormalizedHost();

                if (customDomain && host && !isUUID(urlParam)) {
                    // Custom domain: resolve via host + gallerySlug
                    console.log('[ACCESS] Resolving via custom domain:', host, urlParam);
                    const result = await studioApi.resolve({
                        host,
                        gallerySlug: urlParam,
                    });
                    resolvedId = result.gallery.id;
                } else if (!isUUID(urlParam)) {
                    // Platform domain: resolve via slug
                    const slugResult = await galleryApi.getBySlug(urlParam);
                    resolvedId = slugResult.galleryId;
                }

                setGalleryId(resolvedId);

                // Fetch full config with the resolved galleryId
                const configResult = await galleryApi.getPublicConfig(resolvedId);
                setConfig(configResult);
                setGalleryName(configResult.galleryName);
            } catch (error) {
                console.error('Failed to resolve gallery or fetch config:', error);
                toast.error('This gallery could not be found');
            } finally {
                setConfigLoading(false);
            }
        };

        resolveAndFetchConfig();
    }, [urlParam]);

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
        if (!galleryId) {
            toast.error('Please wait, loading gallery...');
            return;
        }
        setIsLoading(true);

        try {
            const result = await galleryApi.access(galleryId, {
                privateKey,
                clientName: clientName || undefined,
            });
            setSessionToken(result.sessionToken);
            toast.success(`Welcome! Entering ${result.gallery.name}...`);
            router.push(`/g/${galleryId}`);
        } catch (error) {
            toast.error('That code doesn\'t seem to work. Please check and try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelfieSubmit = async () => {
        if (!selfieFile || !consentChecked) return;
        if (!galleryId) {
            toast.error('Please wait, loading gallery...');
            return;
        }

        setScreen('processing');
        setProgress(0);

        try {
            const result = await faceApi.guestAccess(galleryId, mobileNumber, selfieFile);
            setSessionToken(result.sessionToken);
            setGalleryName(result.gallery.name);
            setProgress(100);

            if (selfiePreview) {
                sessionStorage.setItem('guest_selfie_preview', selfiePreview);
                sessionStorage.setItem('guest_matched_count', result.matchedCount.toString());
            }

            setTimeout(() => {
                if (result.matchedCount === 0) {
                    toast.info('We couldn\'t find photos with your face. Try a different selfie or use an access code.');
                } else {
                    toast.success(`Found ${result.matchedCount} photos of you!`);
                }
                router.push(`/g/${galleryId}`);
            }, 500);
        } catch (error: any) {
            if (error.message?.includes('RATE_LIMIT_EXCEEDED')) {
                toast.error('Too many attempts. Please try again in a few minutes.');
            } else {
                toast.error('Something went wrong. Please try again or use an access code.');
            }
            setScreen('selfie');
        }
    };

    // Format event date nicely
    const formatEventDate = (dateStr: string | null) => {
        if (!dateStr) return null;
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
    };

    // =========================================================================
    // STUDIO BRANDING COMPONENT
    // =========================================================================
    const StudioBranding = () => {
        const content = (
            <div className="flex items-center gap-3 group">
                {config?.studio.logoUrl ? (
                    <img
                        src={config.studio.logoUrl}
                        alt={config.studio.name}
                        className="w-10 h-10 rounded-full object-cover border-2 border-white/20 group-hover:border-white/40 transition-all"
                    />
                ) : (
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-semibold group-hover:bg-white/30 transition-all">
                        {config?.studio.name?.charAt(0) || 'S'}
                    </div>
                )}
                <span className="text-white font-medium text-sm drop-shadow-sm group-hover:underline underline-offset-2 transition-all">
                    {config?.studio.name || 'Photo Gallery'}
                </span>
            </div>
        );

        // If website URL exists, make it clickable
        if (config?.studio.websiteUrl) {
            return (
                <a
                    href={config.studio.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cursor-pointer"
                >
                    {content}
                </a>
            );
        }

        return content;
    };

    // =========================================================================
    // ENTRY SCREEN - Main access options
    // =========================================================================
    const renderEntryScreen = () => (
        <div className="w-full max-w-md mx-auto px-4">
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-white/20">
                {/* Gallery Info */}
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-semibold text-gray-900 mb-1">
                        {config?.galleryName || 'Your Gallery'}
                    </h1>
                    {config?.eventDate && (
                        <p className="text-gray-500 text-sm">
                            {formatEventDate(config.eventDate)}
                        </p>
                    )}
                </div>

                {/* Main Heading */}
                <h2 className="text-lg font-medium text-center text-gray-800 mb-2">
                    View your photos securely
                </h2>
                <p className="text-center text-gray-500 text-sm mb-8">
                    This gallery is private and shared only with you
                </p>

                {/* Primary CTA - Selfie (only shown if enabled) */}
                {config?.selfieMatchingEnabled && (
                    <>
                        <button
                            onClick={() => setScreen('selfie')}
                            className="w-full bg-[#8B1538] hover:bg-[#7a1230] text-white rounded-xl py-4 px-6 flex items-center justify-center gap-3 transition-all transform hover:scale-[1.01] shadow-lg mb-3"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="font-medium">Find my photos with a selfie</span>
                        </button>
                        <p className="text-center text-gray-400 text-xs mb-6">
                            Fastest option — we'll show only photos you appear in
                        </p>

                        {/* Divider */}
                        <div className="flex items-center gap-4 mb-6">
                            <div className="flex-1 h-px bg-gray-200"></div>
                            <span className="text-gray-400 text-xs uppercase tracking-wider">or</span>
                            <div className="flex-1 h-px bg-gray-200"></div>
                        </div>
                    </>
                )}

                {/* Secondary CTA - Access Code */}
                <button
                    onClick={() => setScreen('private-key')}
                    className={`w-full border-2 rounded-xl py-4 px-6 flex items-center justify-center gap-3 transition-all transform hover:scale-[1.01] ${config?.selfieMatchingEnabled
                        ? 'bg-white border-gray-200 hover:border-gray-300 text-gray-700'
                        : 'bg-[#8B1538] hover:bg-[#7a1230] text-white border-transparent shadow-lg'
                        }`}
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    <span className="font-medium">I have an access code</span>
                </button>
                {!config?.selfieMatchingEnabled && (
                    <p className="text-center text-gray-400 text-xs mt-3">
                        Enter the code shared by your photographer
                    </p>
                )}

                {/* Privacy Notice */}
                <div className="flex items-center justify-center gap-2 mt-8 text-xs text-gray-400">
                    <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span>Your photos are private and never shared publicly</span>
                </div>
            </div>
        </div>
    );

    // =========================================================================
    // PRIVATE KEY SCREEN
    // =========================================================================
    const renderPrivateKeyScreen = () => (
        <div className="w-full max-w-md mx-auto px-4">
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl overflow-hidden border border-white/20">
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
                    <h2 className="flex-1 text-center font-semibold text-gray-900 pr-8">Enter Access Code</h2>
                </div>

                <form onSubmit={handlePrivateKeyAccess} className="p-6 space-y-5">
                    <div className="text-center mb-4">
                        <p className="text-gray-500 text-sm">
                            Enter the code shared by your photographer
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Input
                            id="privateKey"
                            type="text"
                            placeholder="Enter your code"
                            value={privateKey}
                            onChange={(e) => setPrivateKey(e.target.value)}
                            required
                            autoComplete="off"
                            className="font-mono text-center text-xl tracking-[0.3em] h-14 bg-gray-50 border-gray-200 focus:border-[#8B1538] focus:ring-[#8B1538]"
                        />
                    </div>

                    <div className="space-y-2">
                        <Input
                            id="clientName"
                            type="text"
                            placeholder="Your name (optional)"
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
                            className="h-12 bg-gray-50 border-gray-200"
                        />
                    </div>

                    <Button
                        type="submit"
                        disabled={isLoading || !privateKey}
                        className="w-full h-14 bg-[#8B1538] hover:bg-[#7a1230] text-white font-medium rounded-xl shadow-lg transform hover:scale-[1.01] transition-all disabled:opacity-50 disabled:transform-none"
                    >
                        {isLoading ? 'Verifying...' : 'View Gallery'}
                    </Button>
                </form>
            </div>
        </div>
    );

    // =========================================================================
    // SELFIE UPLOAD SCREEN
    // =========================================================================
    const renderSelfieScreen = () => (
        <div className="w-full max-w-md mx-auto px-4">
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl overflow-hidden border border-white/20">
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
                    <h2 className="flex-1 text-center font-semibold text-gray-900 pr-8">Find Your Photos</h2>
                </div>

                <div className="p-6">
                    {/* Upload Zone */}
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="relative border-2 border-dashed border-gray-300 rounded-xl p-8 cursor-pointer hover:border-[#8B1538] hover:bg-rose-50/50 transition-all"
                    >
                        {selfiePreview ? (
                            <div className="flex flex-col items-center">
                                <img
                                    src={selfiePreview}
                                    alt="Your selfie"
                                    className="w-32 h-32 object-cover rounded-full border-4 border-white shadow-lg"
                                />
                                <p className="text-sm text-gray-500 mt-3">Tap to change photo</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center">
                                <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mb-4">
                                    <svg className="w-10 h-10 text-[#8B1538]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                </div>
                                <p className="text-gray-700 font-medium mb-1">Upload a selfie</p>
                                <p className="text-gray-400 text-sm">We'll find all photos you appear in</p>
                            </div>
                        )}
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

                    {/* Mobile Number (Optional) */}
                    {selfiePreview && (
                        <div className="mt-4 space-y-2">
                            <Label htmlFor="mobileNumber" className="text-gray-500 text-sm">
                                Mobile number (optional, for photo delivery)
                            </Label>
                            <Input
                                id="mobileNumber"
                                type="tel"
                                placeholder="Your mobile number"
                                value={mobileNumber}
                                onChange={(e) => setMobileNumber(e.target.value)}
                                className="h-12 bg-gray-50 border-gray-200"
                            />
                        </div>
                    )}

                    {/* Consent & Submit */}
                    {selfiePreview && (
                        <div className="mt-6 space-y-4">
                            <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                                <Checkbox
                                    id="consent"
                                    checked={consentChecked}
                                    onCheckedChange={(checked) => setConsentChecked(checked as boolean)}
                                    className="mt-1"
                                />
                                <label htmlFor="consent" className="text-sm text-gray-600 leading-relaxed cursor-pointer">
                                    I consent to facial recognition to find my photos. My data is processed securely and not shared.
                                </label>
                            </div>

                            <Button
                                type="button"
                                onClick={handleSelfieSubmit}
                                disabled={!consentChecked || isLoading}
                                className="w-full h-14 bg-[#8B1538] hover:bg-[#7a1230] text-white font-medium rounded-xl shadow-lg transform hover:scale-[1.01] transition-all disabled:opacity-50 disabled:transform-none"
                            >
                                Find My Photos
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    // =========================================================================
    // PROCESSING SCREEN
    // =========================================================================
    const renderProcessingScreen = () => (
        <div className="w-full max-w-md mx-auto px-4">
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-white/20">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-semibold text-gray-900 mb-2">Finding your photos...</h1>
                    <p className="text-gray-500">This usually takes just a few seconds</p>
                </div>

                {/* Selfie Preview */}
                {selfiePreview && (
                    <div className="flex justify-center mb-8">
                        <div className="relative">
                            <img
                                src={selfiePreview}
                                alt="Your selfie"
                                className="w-24 h-24 object-cover rounded-full border-4 border-white shadow-xl"
                            />
                            <div className="absolute inset-0 rounded-full border-4 border-[#8B1538] border-t-transparent animate-spin"></div>
                        </div>
                    </div>
                )}

                {/* Progress Bar */}
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
                    <div
                        className="h-full bg-gradient-to-r from-[#8B1538] to-rose-400 transition-all duration-300"
                        style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                </div>

                <p className="text-center text-gray-400 text-sm">
                    Analyzing your photo against the gallery...
                </p>
            </div>
        </div>
    );

    // =========================================================================
    // LOADING STATE
    // =========================================================================
    if (configLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
                <div className="text-center text-white">
                    <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-400">Loading gallery...</p>
                </div>
            </div>
        );
    }

    // =========================================================================
    // MAIN RENDER
    // =========================================================================
    return (
        <div className="min-h-screen relative">
            {/* Background - Cover Photo or Gradient */}
            {config?.coverPhotoUrl ? (
                <>
                    <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{ backgroundImage: `url(${config.coverPhotoUrl})` }}
                    />
                    {/* Dark overlay for readability */}
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
                </>
            ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-[#4a0d20] to-gray-900" />
            )}

            {/* Content */}
            <div className="relative z-10 min-h-screen flex flex-col">
                {/* Header with Studio Branding */}
                <header className="flex items-center justify-between px-6 py-4">
                    <StudioBranding />
                    <a
                        href="#"
                        className="text-white/70 hover:text-white text-sm transition-colors"
                    >
                        Need help?
                    </a>
                </header>

                {/* Main Content */}
                <main className="flex-1 flex items-center justify-center py-8">
                    {screen === 'entry' && renderEntryScreen()}
                    {screen === 'private-key' && renderPrivateKeyScreen()}
                    {screen === 'selfie' && renderSelfieScreen()}
                    {screen === 'processing' && renderProcessingScreen()}
                </main>

                {/* Footer */}
                <footer className="text-center py-4 px-6">
                    <p className="text-white/40 text-xs">
                        Powered by Pickal • Private & Secure
                    </p>
                </footer>
            </div>
        </div>
    );
}
