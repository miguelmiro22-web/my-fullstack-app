import type { Request, Response, NextFunction } from 'express';

export default function errorHandler(
    err: Error | string,
    req: Request,
    res: Response,
    next: NextFunction
): Response | void {
    if (typeof err === 'string') {
        const is404 = err.toLowerCase().endsWith('not found');
        const statusCode = is404 ? 404 : 400;
        return res.status(statusCode).json({ message: err });
    }

    if (err instanceof Error) {
        return res.status(500).json({ message: err.message });
    }

    return res.status(500).json({ message: 'Internal server error' });
}