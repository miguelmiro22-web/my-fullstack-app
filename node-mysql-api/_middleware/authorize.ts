import { expressjwt } from 'express-jwt';
import db from '../_helpers/db.js';

const secret = process.env.JWT_SECRET || 'FALLBACK_SECRET';

export default function authorize(roles: any = []) {
    if (typeof roles === 'string') {
        roles = [roles];
    }
    return [
    (req: any, res: any, next: any) => {
        console.log('Auth header received:', req.headers.authorization ? 'YES' : 'NO');
        next();
    },
    expressjwt({ secret, algorithms: ['HS256'] }),
    async (req: any, res: any, next: any) => {
        const account = await db.Account.findByPk(req.auth.id);
        if (!account || (roles.length && !roles.includes(account.role))) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        req.auth.role = account.role;
        const refreshTokens = await account.getRefreshTokens();
        req.auth.ownsToken = (token: any) => !!refreshTokens.find((x: any) => x.token === token);
        next();
    }
];
    
    return [
        expressjwt({ secret, algorithms: ['HS256'] }),
        async (req: any, res: any, next: any) => {
            const account = await db.Account.findByPk(req.auth.id);

            if (!account || (roles.length && !roles.includes(account.role))) {
                return res.status(401).json({ message: 'Unauthorized' });
            }

            req.auth.role = account.role;
            const refreshTokens = await account.getRefreshTokens();
            req.auth.ownsToken = (token: any) => !!refreshTokens.find((x: any) => x.token === token);
            next();
        }
    ];
}
