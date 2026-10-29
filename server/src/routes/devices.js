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
import {
  getLive,
  isOnline,
  logActivity,
  watchDevice,
  unwatchDevice,
} from '../services/telemetry.js';
import { removeUserFromDevice } from '../services/sockets.js';

const router = Router();
router.use(requireAuth);

const ACTUATORS = ['fans', 'vents', 'drip', 'refill', 'light', 'mist'];

const LABELS = {
  fans: 'Blower fans',
  vents: 'Roof vents',
  drip: 'Drip irrigation',
  refill: 'Tank refill pump',
  light: 'Grow light',
  mist: 'Mist sprayer',
};

const safeEqual = (a, b) => {
  if (a == null || b == null) return false;

  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));

  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const present = (device) => {
  const live = getLive(device.deviceId);

  return {
    id: device.deviceId,
    deviceId: device.deviceId,
    name: device.name,
    location: device.location,
    claimedAt: device.claimedAt,
    lastSeenAt: device.lastSeenAt,
    online: live.online,
    telemetry: live.telemetry,
    info: live.info
      ? {
          fw: live.info.fw,
          ip: live.info.ip,
          ssid: live.info.ssid,
        }
      : null,
    settings: device.settings,
  };
};

function normalizeDeviceId(value) {
  return String(value).toUpperCase();
}

function validObjectId(value) {
  return /^[a-f\d]{24}$/i.test(value);
}

// Owner-only access.
// Use this for deleting the greenhouse and managing viewers.
async function owned(req) {
  const device = await Device.findOne({
    deviceId: normalizeDeviceId(req.params.deviceId),
    owner: req.userId,
  });

  if (!device) {
    throw new AppError(404, 'Greenhouse not found.');
  }

  return device;
}

// Read access for the owner and every invited viewer.
async function accessible(req) {
  const device = await Device.findOne({
    deviceId: normalizeDeviceId(req.params.deviceId),
    $or: [
      { owner: req.userId },
      { 'viewers.user': req.userId },
    ],
  });

  if (!device) {
    throw new AppError(404, 'Greenhouse not found.');
  }

  return device;
}

// Control access for the owner and viewers with canControl enabled.
async function controllable(req) {
  const device = await accessible(req);

  // The owner always has control.
  if (device.owner.equals(req.userId)) {
    return device;
  }

  const permission = device.viewers.find(
    (viewer) => viewer.user.equals(req.userId),
  );

  if (!permission?.canControl) {
    throw new AppError(
      403,
      'You have viewing access only. Ask the greenhouse owner to enable control access.',
    );
  }

  return device;
}

// ---------- list accessible greenhouses ----------
router.get('/', wrap(async (req, res) => {
  const devices = await Device.find({
    $or: [
      { owner: req.userId },
      { 'viewers.user': req.userId },
    ],
  }).sort({ createdAt: 1 });

  res.json({
    devices: devices.map(present),
  });
}));

// ---------- claim greenhouse ----------
const claimLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many pairing attempts. Please wait a few minutes.',
  },
});

const claimSchema = z.object({
  deviceId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^GH-[0-9A-F]{6}$/, 'Device ID looks like GH-A1B2C3'),

  claimCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Claim code is 6 digits'),

  name: z
    .string()
    .trim()
    .min(2, 'Give your greenhouse a name')
    .max(60),

  location: z
    .string()
    .trim()
    .max(80)
    .optional()
    .default(''),
});

router.post('/claim', claimLimiter, wrap(async (req, res) => {
  const data = claimSchema.parse(req.body);

  if (await Device.exists({ deviceId: data.deviceId })) {
    throw new AppError(409, 'This device is already linked to an account.');
  }

  const info = (
    await rtdb.ref(`devices/${data.deviceId}/uplink/info`).get()
  ).val();

  if (!info) {
    throw new AppError(
      404,
      'We could not find this device. Power it on, join it to WiFi and try again.',
    );
  }

  if (!safeEqual(info.claimCode, data.claimCode)) {
    throw new AppError(
      403,
      'The claim code does not match the one shown by your device.',
    );
  }

  const device = await Device.create({
    deviceId: data.deviceId,
    owner: req.userId,
    name: data.name,
    location: data.location,
    viewers: [],
  });

  await rtdb
    .ref(`devices/${data.deviceId}/downlink/config`)
    .set({
      ...DEFAULT_SETTINGS,
      rev: Date.now(),
    });

  watchDevice(device);

  await logActivity({
    deviceId: data.deviceId,
    owner: device.owner,
    type: 'system',
    message: `Greenhouse "${data.name}" linked to your account.`,
  });

  res.status(201).json({
    device: present(device),
  });
}));

// ---------- viewer management: owner only ----------

// List viewers and their current permissions.
router.get('/:deviceId/viewers', wrap(async (req, res) => {
  const device = await owned(req);

  const userIds = device.viewers.map((viewer) => viewer.user);

  const users = await User.find({
    _id: { $in: userIds },
  })
    .select('name email')
    .lean();

  const usersById = new Map(
    users.map((user) => [user._id.toString(), user]),
  );

  res.json({
    viewers: device.viewers.map((viewer) => {
      const user = usersById.get(viewer.user.toString());

      return {
        id: viewer.user.toString(),
        name: user?.name ?? 'Unknown user',
        email: user?.email ?? '',
        canControl: viewer.canControl,
      };
    }),
  });
}));

// Invite an existing registered user.
// canControl is optional and defaults to false.
router.post('/:deviceId/viewers', wrap(async (req, res) => {
  const device = await owned(req);

  const data = z.object({
    email: z.string().trim().email().max(254)
      .transform((value) => value.toLowerCase()),
    canControl: z.boolean().optional().default(false),
  }).parse(req.body);

  const user = await User.findOne({
    email: data.email,
  }).select('name email');

  if (!user) {
    throw new AppError(
      404,
      'No registered user was found with that email address.',
    );
  }

  if (user._id.equals(device.owner)) {
    throw new AppError(400, 'The owner already has full access.');
  }

  if (
    device.viewers.some((viewer) => viewer.user.equals(user._id))
  ) {
    throw new AppError(409, 'This user already has access.');
  }

  device.viewers.push({
    user: user._id,
    canControl: data.canControl,
  });

  await device.save();

  await logActivity({
    deviceId: device.deviceId,
    owner: device.owner,
    type: 'system',
    message: `Viewer access granted to ${user.email}. Control access: ${data.canControl ? 'enabled' : 'disabled'}.`,
  });

  res.status(201).json({
    ok: true,
    viewer: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      canControl: data.canControl,
    },
  });
}));

// Change an existing viewer's control permission.
router.patch('/:deviceId/viewers/:userId', wrap(async (req, res) => {
  const device = await owned(req);

  if (!validObjectId(req.params.userId)) {
    throw new AppError(404, 'Viewer not found.');
  }

  const { canControl } = z.object({
    canControl: z.boolean(),
  }).parse(req.body);

  const viewer = device.viewers.find(
    (item) => item.user.toString() === req.params.userId,
  );

  if (!viewer) {
    throw new AppError(404, 'Viewer not found.');
  }

  viewer.canControl = canControl;
  await device.save();

  const user = await User.findById(viewer.user).select('name email');

  await logActivity({
    deviceId: device.deviceId,
    owner: device.owner,
    type: 'system',
    message: `Control access ${canControl ? 'enabled' : 'disabled'} for ${user?.email ?? 'viewer'}.`,
  });

  res.json({
    ok: true,
    viewer: {
      id: viewer.user.toString(),
      name: user?.name ?? 'Unknown user',
      email: user?.email ?? '',
      canControl: viewer.canControl,
    },
  });
}));

// Remove a viewer's access completely.
router.delete('/:deviceId/viewers/:userId', wrap(async (req, res) => {
  const device = await owned(req);

  if (!validObjectId(req.params.userId)) {
    throw new AppError(404, 'Viewer not found.');
  }

  const index = device.viewers.findIndex(
    (viewer) => viewer.user.toString() === req.params.userId,
  );

  if (index === -1) {
    throw new AppError(404, 'Viewer not found.');
  }

  const [removedViewer] = device.viewers.splice(index, 1);

  await device.save();

  // Disconnect this user's live subscription to this greenhouse.
  removeUserFromDevice(
    removedViewer.user.toString(),
    device.deviceId,
  );

  const user = await User.findById(removedViewer.user).select('email');

  await logActivity({
    deviceId: device.deviceId,
    owner: device.owner,
    type: 'system',
    message: `Viewer access revoked for ${user?.email ?? 'a user'}.`,
  });

  res.json({ ok: true });
}));

// ---------- greenhouse details ----------

// Owner and viewers can read greenhouse details.
router.get('/:deviceId', wrap(async (req, res) => {
  const device = await accessible(req);

  res.json({
    device: present(device),
  });
}));

// Only the owner can rename the greenhouse or change its location.
router.patch('/:deviceId', wrap(async (req, res) => {
  const device = await owned(req);

  const patch = z.object({
    name: z.string().trim().min(2).max(60).optional(),
    location: z.string().trim().max(80).optional(),
  }).parse(req.body);

  Object.assign(device, patch);
  await device.save();

  res.json({
    device: present(device),
  });
}));

// Only the owner can delete the greenhouse.
router.delete('/:deviceId', wrap(async (req, res) => {
  const device = await owned(req);

  unwatchDevice(device.deviceId);

  await rtdb
    .ref(`devices/${device.deviceId}/downlink`)
    .remove();

  await Promise.all([
    Telemetry.deleteMany({ deviceId: device.deviceId }),
    Activity.deleteMany({ deviceId: device.deviceId }),
    device.deleteOne(),
  ]);

  res.json({ ok: true });
}));

// ---------- manual actuator control ----------
// Owner: always allowed.
// Viewer: allowed only when canControl is true.
const controlSchema = z.object({
  actuator: z.enum(ACTUATORS),
  mode: z.enum(['auto', 'on', 'off']),
});

router.post('/:deviceId/control', wrap(async (req, res) => {
  const device = await controllable(req);
  const { actuator, mode } = controlSchema.parse(req.body);

  if (!isOnline(device.deviceId)) {
    throw new AppError(
      409,
      'The greenhouse is offline. Commands can only be sent while it is connected.',
    );
  }

  await rtdb
    .ref(`devices/${device.deviceId}/downlink/control/${actuator}`)
    .set({
      mode,
      rev: Date.now(),
    });

  const user = await User.findById(req.userId).select('name');

  await logActivity({
    deviceId: device.deviceId,
    owner: device.owner,
    type: 'override',
    message: mode === 'auto'
      ? `${LABELS[actuator]} returned to automatic by ${user?.name || 'a user with control access'}.`
      : `${LABELS[actuator]} forced ${mode.toUpperCase()} by ${user?.name || 'a user with control access'}.`,
  });

  res.json({ ok: true });
}));

// ---------- automation settings ----------
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
})
  .refine(
    (settings) => settings.ldrDark > settings.ldrBright,
    {
      message: 'Dark threshold must be higher than bright threshold',
      path: ['ldrDark'],
    },
  )
  .refine(
    (settings) => settings.soilDry >= settings.soilWet + 50,
    {
      message: 'Dry value must be at least 50 above wet value',
      path: ['soilDry'],
    },
  );

// Owner and viewers can read settings.
router.get('/:deviceId/settings', wrap(async (req, res) => {
  const device = await accessible(req);

  res.json({
    settings: device.settings,
    defaults: DEFAULT_SETTINGS,
  });
}));

// Only the owner and control-enabled viewers can update settings.
router.put('/:deviceId/settings', wrap(async (req, res) => {
  const device = await controllable(req);
  const settings = settingsSchema.parse(req.body);

  device.settings = settings;
  await device.save();

  await rtdb
    .ref(`devices/${device.deviceId}/downlink/config`)
    .set({
      ...settings,
      rev: Date.now(),
    });

  await logActivity({
    deviceId: device.deviceId,
    owner: device.owner,
    type: 'settings',
    message: 'Automation settings updated.',
  });

  res.json({
    settings: device.settings,
  });
}));

// ---------- telemetry history ----------
const RANGES = {
  '1h': { ms: 3600e3, bin: 60e3 },
  '6h': { ms: 6 * 3600e3, bin: 5 * 60e3 },
  '24h': { ms: 24 * 3600e3, bin: 15 * 60e3 },
  '7d': { ms: 7 * 86400e3, bin: 2 * 3600e3 },
  '30d': { ms: 30 * 86400e3, bin: 8 * 3600e3 },
};

router.get('/:deviceId/history', wrap(async (req, res) => {
  const device = await accessible(req);
  const range = RANGES[req.query.range] || RANGES['24h'];
  const since = new Date(Date.now() - range.ms);

  const rows = await Telemetry.aggregate([
    {
      $match: {
        deviceId: device.deviceId,
        ts: { $gte: since },
      },
    },
    {
      $group: {
        _id: {
          $subtract: [
            { $toLong: '$ts' },
            { $mod: [{ $toLong: '$ts' }, range.bin] },
          ],
        },
        temp: { $avg: '$temp' },
        hum: { $avg: '$hum' },
        soil: { $avg: '$soil' },
        ldr: { $avg: '$ldr' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const round1 = (value) => (
    value == null ? null : Math.round(value * 10) / 10
  );

  res.json({
    points: rows.map((row) => ({
      t: row._id,
      temp: round1(row.temp),
      hum: round1(row.hum),
      soil: round1(row.soil),
      ldr: Math.round(row.ldr ?? 0),
    })),
  });
}));

// ---------- activity ----------
router.get('/:deviceId/activity', wrap(async (req, res) => {
  const device = await accessible(req);

  const requestedLimit = Number(req.query.limit) || 50;
  const limit = Math.min(Math.max(requestedLimit, 1), 200);

  const items = await Activity.find({
    deviceId: device.deviceId,
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  res.json({
    items: items.map((activity) => ({
      id: activity._id.toString(),
      type: activity.type,
      level: activity.level,
      message: activity.message,
      createdAt: activity.createdAt,
    })),
  });
}));

export default router;
