/**
 * API Client for Client Gallery
 * 
 * Handles all HTTP requests to the backend API.
 * Manages JWT tokens and session tokens.
 */

// P0: Strict API URL resolution
const ENV_API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL;

if (!ENV_API_URL && process.env.NODE_ENV === 'production') {
    throw new Error('Configuration Error: NEXT_PUBLIC_API_BASE_URL is missing in production build.');
}

export const API_URL = ENV_API_URL || 'http://localhost:3001';

// Token management
let authToken: string | null = null;
let sessionToken: string | null = null;

export function setAuthToken(token: string | null) {
    authToken = token;
    if (typeof window !== 'undefined') {
        if (token) {
            localStorage.setItem('auth_token', token);
        } else {
            localStorage.removeItem('auth_token');
        }
    }
}

export function setSessionToken(token: string | null) {
    sessionToken = token;
    if (typeof window !== 'undefined') {
        if (token) {
            sessionStorage.setItem('session_token', token);
        } else {
            sessionStorage.removeItem('session_token');
        }
    }
}

export function getAuthToken(): string | null {
    if (authToken) return authToken;
    if (typeof window !== 'undefined') {
        authToken = localStorage.getItem('auth_token');
    }
    return authToken;
}

export function getSessionToken(): string | null {
    if (sessionToken) return sessionToken;
    if (typeof window !== 'undefined') {
        sessionToken = sessionStorage.getItem('session_token');
    }
    return sessionToken;
}

// API request helper
interface RequestOptions {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: Record<string, unknown> | FormData;
    useAuth?: boolean;
    useSession?: boolean;
}

export async function apiRequest<T>(
    endpoint: string,
    options: RequestOptions = {}
): Promise<T> {
    const { method = 'GET', body, useAuth = true, useSession = false } = options;

    const headers: Record<string, string> = {};

    // Add auth headers - session token takes priority over auth token
    if (useSession) {
        const token = getSessionToken();
        if (token) {
            headers['x-session-token'] = token;
        }
    } else if (useAuth) {
        const token = getAuthToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
    }

    // Set content type for JSON
    if (body && !(body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
        method,
        headers,
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: 'Request failed' } }));
        throw new Error(error.error?.message || 'Request failed');
    }

    return response.json();
}

// ============================================================================
// AUTH API
// ============================================================================

export interface Photographer {
    id: string;
    email: string;
    name: string;
    businessName?: string;
    logoUrl?: string;
    createdAt: string;
}

export interface AuthResponse {
    photographer: Photographer;
    token: string;
}

export const authApi = {
    register: (data: { email: string; password: string; name: string; businessName?: string }) =>
        apiRequest<AuthResponse>('/api/auth/register', { method: 'POST', body: data, useAuth: false }),

    login: (data: { email: string; password: string }) =>
        apiRequest<AuthResponse>('/api/auth/login', { method: 'POST', body: data, useAuth: false }),

    me: () => apiRequest<{ photographer: Photographer }>('/api/auth/me'),

    updateProfile: (data: {
        name?: string;
        businessName?: string;
        logoUrl?: string | null;
        websiteUrl?: string | null;
        reviewUrl?: string | null;
        whatsappNumber?: string | null;
    }) =>
        apiRequest<{ photographer: Photographer }>('/api/auth/profile', { method: 'PATCH', body: data }),
};

// ============================================================================
// GALLERY API
// ============================================================================

export interface Gallery {
    id: string;
    name: string;
    description?: string;
    eventDate?: string;
    privateKey?: string;
    // P0-1: Custom slug and short password for easy sharing
    customSlug?: string | null;
    customPassword?: string | null;
    // P0-2: Internal notes visible only to photographer
    internalNotes?: string | null;
    downloadsEnabled: boolean;
    downloadResolution: 'web' | 'original';
    selectionState: 'DISABLED' | 'OPEN' | 'LOCKED';
    commentsEnabled: boolean;
    selfieMatchingEnabled?: boolean;
    coverPhotoId?: string | null;
    coverPhoto?: Photo;
    photographer?: {
        id: string;
        name: string;
        businessName?: string;
        logoUrl?: string;
        websiteUrl?: string;
        reviewUrl?: string;
        whatsappNumber?: string;
    };
    createdAt: string;
    updatedAt: string;
    sections?: Section[];
    _count?: {
        photos: number;
        sections: number;
        primaryClients: number;
        guests: number;
    };
}

export interface Section {
    id: string;
    name: string;
    description?: string;
    sortOrder: number;
    _count?: {
        photos: number;
    };
}

export const galleryApi = {
    list: () => apiRequest<{ galleries: Gallery[] }>('/api/galleries'),

    get: (id: string, useSession = false) =>
        apiRequest<{ gallery: Gallery }>(`/api/galleries/${id}`, { useSession, useAuth: !useSession }),

    // P0-1: Look up gallery by custom slug
    getBySlug: (slug: string) =>
        apiRequest<{ galleryId: string; name: string }>(`/api/galleries/by-slug/${slug}`, { useAuth: false }),

    create: (data: {
        name: string;
        description?: string;
        eventDate?: string;
        customSlug?: string;
        customPassword?: string;
        internalNotes?: string;
    }) =>
        apiRequest<{ gallery: Gallery }>('/api/galleries', { method: 'POST', body: data }),

    update: (id: string, data: Partial<Gallery>) =>
        apiRequest<{ gallery: Gallery }>(`/api/galleries/${id}`, { method: 'PATCH', body: data }),

    delete: (id: string) =>
        apiRequest<{ success: boolean }>(`/api/galleries/${id}`, { method: 'DELETE' }),

    access: (id: string, data: { privateKey: string; clientName?: string; clientEmail?: string }) =>
        apiRequest<{ sessionToken: string; gallery: { id: string; name: string } }>(
            `/api/galleries/${id}/access`,
            { method: 'POST', body: data, useAuth: false }
        ),

    resetSelections: (id: string) =>
        apiRequest<{ success: boolean }>(`/api/galleries/${id}/reset-selections`, { method: 'POST' }),

    getSelections: (id: string) =>
        apiRequest<{ selections: unknown[]; summary: unknown }>(`/api/galleries/${id}/selections`),

    getPublicConfig: (id: string) =>
        apiRequest<{
            galleryId: string;
            galleryName: string;
            eventDate: string | null;
            coverPhotoUrl: string | null;
            selfieMatchingEnabled: boolean;
            downloadsEnabled: boolean;
            accessModes: string[];
            studio: {
                name: string;
                logoUrl: string | null;
                websiteUrl: string | null;
                reviewUrl: string | null;
                whatsappNumber: string | null;
            };
        }>(
            `/api/galleries/${id}/public-config`,
            { useAuth: false }
        ),
};

// ============================================================================
// PHOTO API
// ============================================================================

export interface Photo {
    id: string;
    filename: string;
    webKey: string;
    webUrl?: string;
    lqipBase64?: string;
    width?: number;
    height?: number;
    sortOrder: number;
    sectionId?: string;
    createdAt: string;
    _count?: {
        selections: number;
        comments: number;
    };
}

export const photoApi = {
    upload: (galleryId: string, files: File | File[], sectionId?: string) => {
        const formData = new FormData();
        formData.append('galleryId', galleryId);
        if (sectionId) formData.append('sectionId', sectionId);

        if (Array.isArray(files)) {
            files.forEach(file => formData.append('photos', file));
        } else {
            // For backward compatibility or single file, standardizing on 'photos' array is cleaner given backend change
            formData.append('photos', files);
        }

        return apiRequest<{ success: boolean; count: number; photos: Photo[] }>('/api/photos/upload', { method: 'POST', body: formData });
    },

    getByGallery: (galleryId: string, params: { sectionId?: string; cursor?: string; limit?: number } = {}, useSession = false) => {
        const query = new URLSearchParams();
        if (params.sectionId) query.append('sectionId', params.sectionId);
        if (params.cursor) query.append('cursor', params.cursor);
        if (params.limit) query.append('limit', params.limit.toString());
        const qs = query.toString();
        return apiRequest<{ photos: Photo[]; nextCursor: string | null }>(`/api/photos/gallery/${galleryId}${qs ? `?${qs}` : ''}`, { useSession });
    },

    get: (id: string, useSession = false) =>
        apiRequest<{ photo: Photo }>(`/api/photos/${id}`, { useSession }),

    download: (id: string, useSession = false) =>
        apiRequest<{ downloadUrl: string }>(`/api/photos/${id}/download`, { useSession }),

    // P0-5: Download all photos in a gallery
    downloadAll: (galleryId: string, useSession = false) =>
        apiRequest<{
            galleryName: string;
            photos: { id: string; filename: string; downloadUrl: string }[];
            totalCount: number;
        }>(`/api/photos/gallery/${galleryId}/download-all`, { useSession }),

    delete: (id: string) =>
        apiRequest<{ success: boolean }>(`/api/photos/${id}`, { method: 'DELETE' }),
};

// ============================================================================
// SECTION API
// ============================================================================

export const sectionApi = {
    create: (data: { galleryId: string; name: string; description?: string }) =>
        apiRequest<{ section: Section }>('/api/sections', { method: 'POST', body: data }),

    update: (id: string, data: Partial<Section>) =>
        apiRequest<{ section: Section }>(`/api/sections/${id}`, { method: 'PATCH', body: data }),

    delete: (id: string) =>
        apiRequest<{ success: boolean }>(`/api/sections/${id}`, { method: 'DELETE' }),
};

// ============================================================================
// SELECTION API
// ============================================================================

export const selectionApi = {
    select: (photoId: string) =>
        apiRequest<{ selection: unknown }>(`/api/selections/${photoId}`, { method: 'POST', useSession: true, useAuth: false }),

    unselect: (photoId: string) =>
        apiRequest<{ message: string }>(`/api/selections/${photoId}`, { method: 'DELETE', useSession: true, useAuth: false }),

    getMy: () =>
        apiRequest<{ selections: { photoId: string }[]; count: number }>('/api/selections/my', { useSession: true, useAuth: false }),
};

// ============================================================================
// COMMENT API
// ============================================================================

export interface Comment {
    id: string;
    content: string;
    createdAt: string;
    primaryClient: { id: string; name?: string };
}

export const commentApi = {
    create: (photoId: string, content: string) =>
        apiRequest<{ comment: Comment }>(`/api/comments/${photoId}`, {
            method: 'POST',
            body: { content },
            useSession: true,
            useAuth: false
        }),

    getByPhoto: (photoId: string, useSession = false) =>
        apiRequest<{ comments: Comment[] }>(`/api/comments/photo/${photoId}`, { useSession }),

    delete: (id: string) =>
        apiRequest<{ success: boolean }>(`/api/comments/${id}`, { method: 'DELETE', useSession: true, useAuth: false }),
};

// ============================================================================
// PRINT REQUEST API
// ============================================================================

export interface PrintRequest {
    id: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'FULFILLED';
    quantity: number;
    size?: string;
    notes?: string;
    responseNote?: string;
    respondedAt?: string;
    createdAt: string;
    photo?: { id: string; filename: string; webKey: string };
    primaryClient?: { id: string; name?: string; email?: string };
    guest?: { id: string; mobileNumber: string };
}

export const printApi = {
    create: (photoId: string, data: { quantity?: number; size?: string; notes?: string }) =>
        apiRequest<{ printRequest: PrintRequest }>(`/api/print-requests/${photoId}`, {
            method: 'POST',
            body: data,
            useSession: true,
            useAuth: false
        }),

    getByGallery: (galleryId: string) =>
        apiRequest<{ printRequests: PrintRequest[] }>(`/api/print-requests/gallery/${galleryId}`),

    update: (id: string, data: { status: 'APPROVED' | 'REJECTED'; responseNote?: string }) =>
        apiRequest<{ printRequest: PrintRequest }>(`/api/print-requests/${id}`, { method: 'PATCH', body: data }),

    getMy: () =>
        apiRequest<{ printRequests: PrintRequest[] }>('/api/print-requests/my', { useSession: true, useAuth: false }),
};

// ============================================================================
// FACE API
// ============================================================================

export const faceApi = {
    guestAccess: (galleryId: string, mobileNumber: string, selfie: File) => {
        const formData = new FormData();
        formData.append('selfie', selfie);
        formData.append('galleryId', galleryId);
        formData.append('mobileNumber', mobileNumber);
        return apiRequest<{ sessionToken: string; matchedCount: number; gallery: { id: string; name: string } }>(
            '/api/face/guest-access',
            { method: 'POST', body: formData, useAuth: false }
        );
    },
};
