import { rtdb } from '../firebase.js';
import { Device } from '../models/Device.js';
import { Telemetry } from '../models/Telemetry.js';
import { Activity } from '../models/Activity.js';
import { emitToDevice } from './sockets.js';

const ONLINE_WINDOW_MS = 30_000;   // firmware pushes every 5 s
const STORE_EVERY_MS = 60_000;     // history resolution kept in MongoDB

const records = new Map(); // deviceId -> live record
const watchers = new Map(); // deviceId -> { ref, listener }

export async function logActivity({ deviceId, owner, type, level = 'info', message }) {
  const doc = await Activity.create({ deviceId, owner, type, level, message });
  emitToDevice(deviceId, 'activity', {
    id: doc._id.toString(), deviceId, type, level, message, createdAt: doc.createdAt,
  });
  return doc;
}

export function isOnline(deviceId) {
  const rec = records.get(deviceId);
  return !!rec && Date.now() - rec.lastTs < ONLINE_WINDOW_MS;
}

export function getLive(deviceId) {
  const rec = records.get(deviceId);
  return {
    telemetry: rec?.telemetry || null,
    info: rec?.info || null,
    online: isOnline(deviceId),
  };
}

async function setOnline(rec, online) {
  if (rec.online === online) return;
  rec.online = online;
  await Device.updateOne({ deviceId: rec.deviceId }, { online, ...(online ? { lastSeenAt: new Date() } : {}) });
  emitToDevice(rec.deviceId, 'device:status', { deviceId: rec.deviceId, online });
  await logActivity({
    deviceId: rec.deviceId,
    owner: rec.owner,
    type: 'system',
    level: online ? 'info' : 'warn',
    message: online ? 'Greenhouse is back online.' : 'Greenhouse went offline. Automation keeps running on the device.',
  });
}

async function checkAlerts(rec, t) {
  const flags = {
    tankEmpty: t.tank === 'empty',
    highTemp: !!t.highTemp,
    fault: !!t.fault,
  };
  const msgs = {
    tankEmpty: ['error', 'Water tank is empty. Drip irrigation is paused until it refills.'],
    highTemp: ['warn', `Temperature is high (${t.temp}°C). Fans, vents and mist are cooling the greenhouse.`],
    fault: ['error', 'Temperature sensor is not responding. Check the AHT20 wiring.'],
  };
  for (const key of Object.keys(flags)) {
    if (flags[key] && !rec.flags[key]) {
      const [level, message] = msgs[key];
      await logActivity({ deviceId: rec.deviceId, owner: rec.owner, type: 'alert', level, message });
    }
    if (!flags[key] && rec.flags[key] && key === 'tankEmpty') {
      await logActivity({ deviceId: rec.deviceId, owner: rec.owner, type: 'alert', level: 'info', message: 'Water tank is refilling.' });
    }
  }
  rec.flags = flags;
}

async function onTelemetry(rec, value) {
  if (!value) return;
  const ts = typeof value.ts === 'number' ? value.ts : Date.now();
  rec.telemetry = value;
  rec.lastTs = ts;
  const fresh = Date.now() - ts < ONLINE_WINDOW_MS;

  emitToDevice(rec.deviceId, 'telemetry', { deviceId: rec.deviceId, telemetry: value, online: fresh });
  if (!fresh) return; // stale value replayed after a server restart

  await setOnline(rec, true);

  const now = Date.now();
  if (now - rec.lastSeenWrite > 30_000) {
    rec.lastSeenWrite = now;
    Device.updateOne({ deviceId: rec.deviceId }, { lastSeenAt: new Date(ts) }).catch(() => {});
  }
  if (now - rec.lastStored >= STORE_EVERY_MS) {
    rec.lastStored = now;
    Telemetry.create({
      deviceId: rec.deviceId,
      ts: new Date(ts),
      temp: value.temp, hum: value.hum, soil: value.soil, ldr: value.ldr,
      lowRaw: value.lowRaw, highRaw: value.highRaw, tank: value.tank, out: value.out,
    }).catch((e) => console.error('[telemetry] store failed', e.message));
  }
  await checkAlerts(rec, value);
}

export function watchDevice(device) {
  const deviceId = device.deviceId;
  if (watchers.has(deviceId)) return;

  const rec = {
    deviceId,
    owner: device.owner,
    telemetry: null,
    info: null,
    online: !!device.online,
    lastTs: 0,
    lastStored: 0,
    lastSeenWrite: 0,
    flags: {},
  };
  records.set(deviceId, rec);

  const tRef = rtdb.ref(`devices/${deviceId}/uplink/telemetry`);
  const iRef = rtdb.ref(`devices/${deviceId}/uplink/info`);
  const tListener = tRef.on('value', (snap) => {
    onTelemetry(rec, snap.val()).catch((e) => console.error('[telemetry]', e.message));
  });
  const iListener = iRef.on('value', (snap) => { rec.info = snap.val(); });
  watchers.set(deviceId, { tRef, iRef, tListener, iListener });
}

export function unwatchDevice(deviceId) {
  const w = watchers.get(deviceId);
  if (w) {
    w.tRef.off('value', w.tListener);
    w.iRef.off('value', w.iListener);
  }
  watchers.delete(deviceId);
  records.delete(deviceId);
}

export async function startTelemetryService() {
  const devices = await Device.find({});
  devices.forEach(watchDevice);
  console.log(`[telemetry] watching ${devices.length} device(s)`);

  // mark devices offline when they stop reporting
  setInterval(() => {
    for (const rec of records.values()) {
      if (rec.online && Date.now() - rec.lastTs >= ONLINE_WINDOW_MS) {
        setOnline(rec, false).catch(() => {});
      }
    }
  }, 10_000);
}
