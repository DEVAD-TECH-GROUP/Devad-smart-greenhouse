// Creates (or updates) the Firebase Auth account the ESP32 firmware signs in with,
// and tags it with the custom claim `device: true` that database.rules.json checks.
import 'dotenv/config';
import { fbAuth } from '../src/firebase.js';

const email = process.env.FIREBASE_DEVICE_EMAIL;
const password = process.env.FIREBASE_DEVICE_PASSWORD;
if (!email || !password || password.length < 8) {
  console.error('Set FIREBASE_DEVICE_EMAIL and FIREBASE_DEVICE_PASSWORD (8+ chars) in server/.env');
  process.exit(1);
}

let user;
try {
  user = await fbAuth.getUserByEmail(email);
  await fbAuth.updateUser(user.uid, { password });
  console.log(`Updated existing device account ${email}`);
} catch (e) {
  if (e.code !== 'auth/user-not-found') throw e;
  user = await fbAuth.createUser({ email, password, emailVerified: true });
  console.log(`Created device account ${email}`);
}
await fbAuth.setCustomUserClaims(user.uid, { device: true });
console.log('Custom claim device=true set. Put the same email/password in firmware/SmartGreenhouse/Secrets.h');
process.exit(0);
