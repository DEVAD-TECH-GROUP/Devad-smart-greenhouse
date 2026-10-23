import 'dotenv/config';

const need = (key) => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required environment variable ${key} (see server/.env.example)`);
  return v;
};

export const config = {
  port: Number(process.env.PORT || 4000),
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  mongoUri: need('MONGODB_URI'),
  jwtSecret: need('JWT_ACCESS_SECRET'),
  accessTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshDays: Number(process.env.REFRESH_TOKEN_DAYS || 30),
  firebaseDbUrl: need('FIREBASE_DATABASE_URL'),
  retentionDays: Number(process.env.TELEMETRY_RETENTION_DAYS || 30),
};
