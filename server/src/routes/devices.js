import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { rtdb } from '../firebase.js';
import { Device, DEFAULT_SETTINGS } from '../models/Device.js';
import { Telemetry } from '../models/Telemetry.js';
import { Activity } from '../models/Activity.js';
import { User } from '../models/User.js';
import { AppError, wrap } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { getLive, isOnline, logActivity, watchDevice, unwatchDevice } from '../services/telemetry.js';

const router = Router();
router.use(requireAuth);

const ACTUATORS = ['fans', 'vents', 'drip', 'refill', 'light', 'mist'];
const LABELS = {
  fans: 'Blower fans', vents: 'Roof vents', drip: 'Drip irrigation',
  refill: 'Tank refill pump', light: 'Grow light', mist: 'Mist sprayer',
};

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const present = (d) => {
  const live = getLive(d.deviceId);
  return {
    id: d.deviceId,
    deviceId: d.deviceId,
    name: d.name,
    location: d.location,
    claimedAt: d.claimedAt,
    lastSeenAt: d.lastSeenAt,
    online: live.online,
    telemetry: live.telemetry,
    info: live.info ? { fw: live.info.fw, ip: live.info.ip, ssid: live.info.ssid } : null,
    settings: d.settings,
  };
};

async function owned(req) {
  const d = await Device.findOne({ deviceId: req.params.deviceId.toUpperCase(), owner: req.userId });
  if (!d) throw new AppError(404, 'Greenhouse not found.');
  return d;
}

// ---------- list ----------
router.get('/', wrap(async (req, res) => {
  const devices = await Device.find({ owner: req.userId }).sort({ createdAt: 1 });
  res.json({ devices: devices.map(present) });
}));

// ---------- claim ----------
const claimLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many pairing attempts. Please wait a few minutes.' },
});

const claimSchema = z.object({
  deviceId: z.string().trim().toUpperCase().regex(/^GH-[0-9A-F]{6}$/, 'Device ID looks like GH-A1B2C3'),
  claimCode: z.string().trim().regex(/^\d{6}$/, 'Claim code is 6 digits'),
  name: z.string().trim().min(2, 'Give your greenhouse a name').max(60),
  location: z.string().trim().max(80).optional().default(''),
});

router.post('/claim', claimLimiter, wrap(async (req, res) => {
  const data = claimSchema.parse(req.body);

  if (await Device.exists({ deviceId: data.deviceId })) {
    throw new AppError(409, 'This device is already linked to an account.');
  }
  const info = (await rtdb.ref(`devices/${data.deviceId}/uplink/info`).get()).val();
  if (!info) {
    throw new AppError(404, 'We could not find this device. Power it on, join it to WiFi and try again.');
  }
  if (!safeEqual(info.claimCode, data.claimCode)) {
    throw new AppError(403, 'The claim code does not match the one shown by your device.');
  }

  const device = await Device.create({
    deviceId: data.deviceId, owner: req.userId, name: data.name, location: data.location,
  });

  // push the default settings so the device and the dashboard start in sync
  await rtdb.ref(`devices/${data.deviceId}/downlink/config`).set({ ...DEFAULT_SETTINGS, rev: Date.now() });
  watchDevice(device);
  await logActivity({ deviceId: data.deviceId, owner: req.userId, type: 'system', message: `Greenhouse "${data.name}" linked to your account.` });

  res.status(201).json({ device: present(device) });
}));

// ---------- single device ----------
router.get('/:deviceId', wrap(async (req, res) => {
  res.json({ device: present(await owned(req)) });
}));

router.patch('/:deviceId', wrap(async (req, res) => {
  const d = await owned(req);
  const patch = z.object({
    name: z.string().trim().min(2).max(60).optional(),
    location: z.string().trim().max(80).optional(),
  }).parse(req.body);
  Object.assign(d, patch);
  await d.save();
  res.json({ device: present(d) });
}));

router.delete('/:deviceId', wrap(async (req, res) => {
  const d = await owned(req);
  unwatchDevice(d.deviceId);
  await rtdb.ref(`devices/${d.deviceId}/downlink`).remove();
  await Promise.all([
    Telemetry.deleteMany({ deviceId: d.deviceId }),
    Activity.deleteMany({ deviceId: d.deviceId }),
    d.deleteOne(),
  ]);
  res.json({ ok: true });
}));

// ---------- manual override ----------
const controlSchema = z.object({
  actuator: z.enum(ACTUATORS),
  mode: z.enum(['auto', 'on', 'off']),
});

router.post('/:deviceId/control', wrap(async (req, res) => {
  const d = await owned(req);
  const { actuator, mode } = controlSchema.parse(req.body);
  if (!isOnline(d.deviceId)) {
    throw new AppError(409, 'The greenhouse is offline. Commands can only be sent while it is connected.');
  }
  await rtdb.ref(`devices/${d.deviceId}/downlink/control/${actuator}`).set({ mode, rev: Date.now() });
  const user = await User.findById(req.userId).select('name');
  await logActivity({
    deviceId: d.deviceId, owner: req.userId, type: 'override',
    message: mode === 'auto'
      ? `${LABELS[actuator]} returned to automatic by ${user?.name || 'you'}.`
      : `${LABELS[actuator]} forced ${mode.toUpperCase()} by ${user?.name || 'you'}.`,
  });
  res.json({ ok: true });
}));

// ---------- settings ----------
const settingsSchema = z.object({
  tempHigh: z.number().min(15).max(60),
  tempHyst: z.number().min(0.5).max(10),
  ldrBright: z.number().int().min(0).max(1022),
  ldrDark: z.number().int().min(1).max(1023),
  soilWet: z.number().int().min(0).max(1000),
  soilDry: z.number().int().min(50).max(1023),
  tankEmpty: z.number().int().min(0).max(1023),
  tankFilling: z.number().int().min(0).max(1023),
  topFull: z.number().int().min(0).max(1023),
  mistSec: z.number().int().min(1).max(600),
  manualMaxMin: z.number().int().min(0).max(240),
}).refine((s) => s.ldrDark > s.ldrBright, { message: 'Dark threshold must be higher than bright threshold', path: ['ldrDark'] })
  .refine((s) => s.soilDry >= s.soilWet + 50, { message: 'Dry value must be at least 50 above wet value', path: ['soilDry'] });

router.get('/:deviceId/settings', wrap(async (req, res) => {
  const d = await owned(req);
  res.json({ settings: d.settings, defaults: DEFAULT_SETTINGS });
}));

router.put('/:deviceId/settings', wrap(async (req, res) => {
  const d = await owned(req);
  const s = settingsSchema.parse(req.body);
  d.settings = s;
  await d.save();
  await rtdb.ref(`devices/${d.deviceId}/downlink/config`).set({ ...s, rev: Date.now() });
  await logActivity({ deviceId: d.deviceId, owner: req.userId, type: 'settings', message: 'Automation settings updated.' });
  res.json({ settings: d.settings });
}));

// ---------- history ----------
const RANGES = {
  '1h': { ms: 3600e3, bin: 60e3 },
  '6h': { ms: 6 * 3600e3, bin: 5 * 60e3 },
  '24h': { ms: 24 * 3600e3, bin: 15 * 60e3 },
  '7d': { ms: 7 * 86400e3, bin: 2 * 3600e3 },
  '30d': { ms: 30 * 86400e3, bin: 8 * 3600e3 },
};

router.get('/:deviceId/history', wrap(async (req, res) => {
  const d = await owned(req);
  const range = RANGES[req.query.range] || RANGES['24h'];
  const since = new Date(Date.now() - range.ms);
  const rows = await Telemetry.aggregate([
    { $match: { deviceId: d.deviceId, ts: { $gte: since } } },
    {
      $group: {
        _id: { $subtract: [{ $toLong: '$ts' }, { $mod: [{ $toLong: '$ts' }, range.bin] }] },
        temp: { $avg: '$temp' }, hum: { $avg: '$hum' }, soil: { $avg: '$soil' }, ldr: { $avg: '$ldr' },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
  res.json({
    points: rows.map((r) => ({ t: r._id, temp: r1(r.temp), hum: r1(r.hum), soil: r1(r.soil), ldr: Math.round(r.ldr ?? 0) })),
  });
}));

// ---------- activity ----------
router.get('/:deviceId/activity', wrap(async (req, res) => {
  const d = await owned(req);
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const items = await Activity.find({ deviceId: d.deviceId }).sort({ createdAt: -1 }).limit(limit).lean();
  res.json({
    items: items.map((a) => ({ id: a._id.toString(), type: a.type, level: a.level, message: a.message, createdAt: a.createdAt })),
  });
}));

export default router;
