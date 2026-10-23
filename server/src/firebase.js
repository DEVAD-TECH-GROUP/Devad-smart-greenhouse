import fs from 'node:fs';
import admin from 'firebase-admin';
import { config } from './config.js';

function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './serviceAccountKey.json';
  if (!fs.existsSync(path)) {
    throw new Error(
      `Firebase service account not found at ${path}. Download it from Firebase console -> Project settings -> Service accounts.`
    );
  }
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(loadServiceAccount()),
    databaseURL: config.firebaseDbUrl,
  });
}

export const rtdb = admin.database();
export const fbAuth = admin.auth();
