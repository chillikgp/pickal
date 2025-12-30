'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authApi, Photographer, setAuthToken, getAuthToken } from '@/lib/api';

interface AuthContextType {
    photographer: Photographer | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, name: string, businessName?: string) => Promise<void>;
    logout: () => void;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [photographer, setPhotographer] = useState<Photographer | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Check for existing token on mount
        const token = getAuthToken();
        if (token) {
            authApi.me()
                .then(({ photographer }) => setPhotographer(photographer))
                .catch(() => {
                    setAuthToken(null);
                })
                .finally(() => setIsLoading(false));
        } else {
            setIsLoading(false);
        }
    }, []);

    const login = async (email: string, password: string) => {
        const { photographer, token } = await authApi.login({ email, password });
        setAuthToken(token);
        setPhotographer(photographer);
    };

    const register = async (email: string, password: string, name: string, businessName?: string) => {
        const { photographer, token } = await authApi.register({ email, password, name, businessName });
        setAuthToken(token);
        setPhotographer(photographer);
    };

    const logout = () => {
        setAuthToken(null);
        setPhotographer(null);
    };

    const refreshUser = async () => {
        try {
            const { photographer } = await authApi.me();
            setPhotographer(photographer);
        } catch {
            // Ignore errors during refresh
        }
    };

    return (
        <AuthContext.Provider value={{ photographer, isLoading, login, register, logout, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
