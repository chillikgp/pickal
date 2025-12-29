import { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
    statusCode?: number;
    code?: string;
}

export function errorHandler(
    err: ApiError,
    req: Request,
    res: Response,
    next: NextFunction
) {
    console.error('Error:', err);

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal server error';

    res.status(statusCode).json({
        error: {
            message,
            code: err.code || 'INTERNAL_ERROR',
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
        },
    });
}

export function createError(message: string, statusCode: number, code?: string): ApiError {
    const error: ApiError = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
}

export function notFound(message = 'Resource not found'): ApiError {
    return createError(message, 404, 'NOT_FOUND');
}

export function unauthorized(message = 'Unauthorized'): ApiError {
    return createError(message, 401, 'UNAUTHORIZED');
}

export function forbidden(message = 'Forbidden'): ApiError {
    return createError(message, 403, 'FORBIDDEN');
}

export function badRequest(message = 'Bad request'): ApiError {
    return createError(message, 400, 'BAD_REQUEST');
}
