// src/_middleware/errorHandler.ts
import type { Request, Response, NextFunction } from 'express';

export function errorHandler(
    err: Error | string,
    req: Request,
    res: Response,
    next: NextFunction
): Response | void {
    if (typeof err === 'string') {
        // Custom application error
        const is404 = err.toLowerCase().endsWith('not found');
        const statusCode = is404 ? 404 : 400;
        return res.status(statusCode).json({ message: err });
    }

    if (err instanceof Error) {
        // Standard Error object
        return res.status(500).json({ message: err.message });
    }

    // Fallback
    return res.status(500).json({ message: 'Internal server error' });
}