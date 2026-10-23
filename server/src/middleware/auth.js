import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from './errors.js';

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new AppError(401, 'Please sign in to continue.'));
  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    next();
  } catch {
    next(new AppError(401, 'Your session has expired. Please sign in again.'));
  }
}
