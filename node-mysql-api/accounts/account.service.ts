import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Op } from 'sequelize';
import db from '../_helpers/db.js';
import config from '../_helpers/config.js';
import sendEmail from '../_helpers/send-email.js';

export default {
    authenticate,
    refreshToken,
    revokeToken,
    register,
    verifyEmail,
    forgotPassword,
    validateResetToken,
    resetPassword,
    getAll,
    getById,
    create,
    update,
    delete: _delete
};

// ── Public Functions ────────────────────────────────────────────────────────

async function authenticate({ email, password, ipAddress }: any) {
    const account = await db.Account.scope('withHash').findOne({ where: { email } });

    if (!account || !account.isVerified || !(await bcrypt.compare(password, account.passwordHash))) {
        throw 'Email or password is incorrect';
    }

    const jwtToken    = generateJwtToken(account);
    const refreshTkn  = await generateRefreshToken(account, ipAddress);
    await refreshTkn.save();

    return { ...basicDetails(account), jwtToken, refreshToken: refreshTkn.token };
}

async function refreshToken({ token, ipAddress }: any) {
    const refreshTkn = await getRefreshToken(token);
    const account    = await refreshTkn.getAccount();

    const newRefreshToken = await generateRefreshToken(account, ipAddress);
    refreshTkn.revoked       = Date.now();
    refreshTkn.revokedByIp   = ipAddress;
    refreshTkn.replacedByToken = newRefreshToken.token;
    await refreshTkn.save();
    await newRefreshToken.save();

    const jwtToken = generateJwtToken(account);
    return { ...basicDetails(account), jwtToken, refreshToken: newRefreshToken.token };
}

async function revokeToken({ token, ipAddress }: any) {
    const refreshTkn = await getRefreshToken(token);
    refreshTkn.revoked     = Date.now();
    refreshTkn.revokedByIp = ipAddress;
    await refreshTkn.save();
}

async function register(params: any, origin: string) {
    if (await db.Account.findOne({ where: { email: params.email } })) {
        return sendAlreadyRegisteredEmail(params.email, origin);
    }

    const isFirstAccount = (await db.Account.count()) === 0;
    const account = new db.Account(params);
    account.role              = isFirstAccount ? 'Admin' : 'User';
    account.verificationToken = randomTokenString();

    account.passwordHash = await hash(params.password);
    await account.save();

    await sendVerificationEmail(account, origin);
}

async function verifyEmail({ token }: any) {
    const account = await db.Account.findOne({ where: { verificationToken: token } });
    if (!account) throw 'Verification failed';

    account.verified          = Date.now();
    account.verificationToken = undefined as any;
    await account.save();
}

async function forgotPassword({ email }: any, origin: string) {
    const account = await db.Account.findOne({ where: { email } });
    if (!account) return; // silently fail to not expose email enumeration

    account.resetToken        = randomTokenString();
    account.resetTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 h
    await account.save();

    await sendPasswordResetEmail(account, origin);
}

async function validateResetToken({ token }: any) {
    const account = await db.Account.findOne({
        where: {
            resetToken: token,
            resetTokenExpires: { [Op.gt]: Date.now() }
        }
    });
    if (!account) throw 'Invalid token';
    return account;
}

async function resetPassword({ token, password }: any) {
    const account = await validateResetToken({ token });
    account.passwordHash    = await hash(password);
    account.passwordReset   = Date.now();
    account.resetToken      = undefined as any;
    account.resetTokenExpires = undefined as any;
    await account.save();
}

async function getAll() {
    const accounts = await db.Account.findAll();
    return accounts.map(basicDetails);
}

async function getById(id: string) {
    const account = await getAccount(id);
    return basicDetails(account);
}

async function create(params: any) {
    if (await db.Account.findOne({ where: { email: params.email } })) {
        throw `Email "${params.email}" is already registered`;
    }

    const account = new db.Account(params);
    account.verified     = Date.now();
    account.passwordHash = await hash(params.password);
    await account.save();
    return basicDetails(account);
}

async function update(id: string, params: any) {
    const account = await getAccount(id);

    if (params.email && params.email !== account.email &&
        await db.Account.findOne({ where: { email: params.email } })) {
        throw `Email "${params.email}" is already taken`;
    }

    if (params.password) {
        params.passwordHash = await hash(params.password);
    }

    Object.assign(account, params);
    account.updated = Date.now();
    await account.save();
    return basicDetails(account);
}

async function _delete(id: string) {
    const account = await getAccount(id);
    await account.destroy();
}

// ── Private Helpers ─────────────────────────────────────────────────────────

async function getAccount(id: string) {
    const account = await db.Account.findByPk(id);
    if (!account) throw 'Account not found';
    return account;
}

async function getRefreshToken(token: string) {
    const refreshToken = await db.RefreshToken.findOne({ where: { token } });
    if (!refreshToken || !refreshToken.isActive) throw 'Invalid token';
    return refreshToken;
}

async function hash(password: string) {
    return bcrypt.hash(password, 10);
}

function generateJwtToken(account: any) {
    return jwt.sign({ sub: account.id, id: account.id }, config.secret, { expiresIn: '15m' });
}

async function generateRefreshToken(account: any, ipAddress: string) {
    return new db.RefreshToken({
        accountId:   account.id,
        token:       randomTokenString(),
        expires:     new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        createdByIp: ipAddress
    });
}

function randomTokenString() {
    return crypto.randomBytes(40).toString('hex');
}

function basicDetails(account: any) {
    const { id, title, firstName, lastName, email, role, created, updated, isVerified } = account;
    return { id, title, firstName, lastName, email, role, created, updated, isVerified };
}

async function sendVerificationEmail(account: any, origin: string) {
    let message: string;
    if (origin) {
        const verifyUrl = `${origin}/account/verify-email?token=${account.verificationToken}`;
        message = `<p>Please click the below link to verify your email address:</p>
                   <p><a href="${verifyUrl}">${verifyUrl}</a></p>`;
    } else {
        message = `<p>Please use the below token to verify your email address with the <code>/accounts/verify-email</code> API route:</p>
                   <p><code>${account.verificationToken}</code></p>`;
    }

    await sendEmail({
        to:      account.email,
        subject: 'Sign-up Verification API - Verify Email',
        html:    `<h4>Verify Email</h4>
                  <p>Thanks for registering!</p>
                  ${message}`
    });
}

async function sendAlreadyRegisteredEmail(email: string, origin: string) {
    let message: string;
    if (origin) {
        message = `<p>If you don't know your password please visit the <a href="${origin}/account/forgot-password">forgot password</a> page.</p>`;
    } else {
        message = `<p>If you don't know your password you can reset it via the <code>/accounts/forgot-password</code> API route.</p>`;
    }

    await sendEmail({
        to:      email,
        subject: 'Sign-up Verification API - Email Already Registered',
        html:    `<h4>Email Already Registered</h4>
                  <p>Your email <strong>${email}</strong> is already registered.</p>
                  ${message}`
    });
}

async function sendPasswordResetEmail(account: any, origin: string) {
    let message: string;
    if (origin) {
        const resetUrl = `${origin}/account/reset-password?token=${account.resetToken}`;
        message = `<p>Please click the below link to reset your password, the link will be valid for 1 day:</p>
                   <p><a href="${resetUrl}">${resetUrl}</a></p>`;
    } else {
        message = `<p>Please use the below token to reset your password with the <code>/accounts/reset-password</code> API route:</p>
                   <p><code>${account.resetToken}</code></p>`;
    }

    await sendEmail({
        to:      account.email,
        subject: 'Sign-up Verification API - Reset Password',
        html:    `<h4>Reset Password Email</h4>
                  ${message}`
    });
}
