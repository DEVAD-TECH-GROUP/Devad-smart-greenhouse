
import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { User } from '../models/User.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { AppError, wrap } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const COOKIE = 'gh_refresh';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many attempts. Please wait a few minutes and try again.',
  },
});

const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(100)
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(60),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password,
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const sha256 = (value) =>
  crypto.createHash('sha256').update(value).digest('hex');

// Vercel frontend and Render backend are cross-site.
// SameSite=None and Secure are required for the cross-site refresh cookie.
function cookieOptions() {
  const production = config.isProd;

  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: config.refreshDays * 24 * 60 * 60 * 1000,
  };
}

function clearRefreshCookie(res) {
  const options = cookieOptions();

  res.clearCookie(COOKIE, {
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
  });
}

async function issueSession(req, res, user) {
  const accessToken = jwt.sign(
    { sub: user._id.toString() },
    config.jwtSecret,
    { expiresIn: config.accessTtl }
  );

  const refresh = crypto.randomBytes(48).toString('hex');

  await RefreshToken.create({
    user: user._id,
    tokenHash: sha256(refresh),
    userAgent: (req.headers['user-agent'] || '').slice(0, 200),
    expiresAt: new Date(
      Date.now() + config.refreshDays * 24 * 60 * 60 * 1000
    ),
  });

  res.cookie(COOKIE, refresh, cookieOptions());

  return {
    accessToken,
    user: user.toPublic(),
  };
}

router.post(
  '/register',
  authLimiter,
  wrap(async (req, res) => {
    const data = registerSchema.parse(req.body);

    if (await User.exists({ email: data.email })) {
      throw new AppError(
        409,
        'An account with this email already exists. Try signing in.'
      );
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    const user = await User.create({
      name: data.name,
      email: data.email,
      passwordHash,
    });

    res.status(201).json(await issueSession(req, res, user));
  })
);

router.post(
  '/login',
  authLimiter,
  wrap(async (req, res) => {
    const data = loginSchema.parse(req.body);

    const user = await User.findOne({ email: data.email }).select(
      '+passwordHash'
    );

    const valid =
      user && (await bcrypt.compare(data.password, user.passwordHash));

    if (!valid) {
      throw new AppError(401, 'Email or password is incorrect.');
    }

    res.json(await issueSession(req, res, user));
  })
);

// Rotate the refresh token and issue a new access token.
router.post(
  '/refresh',
  wrap(async (req, res) => {
    const raw = req.cookies?.[COOKIE];

    if (!raw) {
      throw new AppError(401, 'Not signed in.');
    }

    const stored = await RefreshToken.findOneAndDelete({
      tokenHash: sha256(raw),
    });

    if (!stored || stored.expiresAt < new Date()) {
      clearRefreshCookie(res);
      throw new AppError(401, 'Session expired. Please sign in again.');
    }

    const user = await User.findById(stored.user);

    if (!user) {
      clearRefreshCookie(res);
      throw new AppError(401, 'Account no longer exists.');
    }

    res.json(await issueSession(req, res, user));
  })
);

router.post(
  '/logout',
  wrap(async (req, res) => {
    const raw = req.cookies?.[COOKIE];

    if (raw) {
      await RefreshToken.deleteOne({
        tokenHash: sha256(raw),
      });
    }

    clearRefreshCookie(res);
    res.json({ ok: true });
  })
);

router.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const user = await User.findById(req.userId);

    if (!user) {
      throw new AppError(401, 'Account no longer exists.');
    }

    res.json({ user: user.toPublic() });
  })
);

router.patch(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const { name } = z
      .object({
        name: z.string().trim().min(2).max(60),
      })
      .parse(req.body);

    const user = await User.findByIdAndUpdate(
      req.userId,
      { name },
      { new: true, runValidators: true }
    );

    if (!user) {
      throw new AppError(401, 'Account no longer exists.');
    }

    res.json({ user: user.toPublic() });
  })
);

router.post(
  '/change-password',
  requireAuth,
  authLimiter,
  wrap(async (req, res) => {
    const { currentPassword, newPassword } = z
      .object({
        currentPassword: z.string().min(1),
        newPassword: password,
      })
      .parse(req.body);

    const user = await User.findById(req.userId).select('+passwordHash');

    if (
      !user ||
      !(await bcrypt.compare(currentPassword, user.passwordHash))
    ) {
      throw new AppError(400, 'Your current password is incorrect.');
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    // Revoke previous refresh tokens, then issue a new session.
    await RefreshToken.deleteMany({ user: user._id });

    res.json(await issueSession(req, res, user));
  })
);

export default router;

