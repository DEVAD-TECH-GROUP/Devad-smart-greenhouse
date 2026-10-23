export function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export const clock = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const dayClock = (ts) =>
  new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export const TANK_LABEL = {
  full: 'Full',
  idle: 'Holding',
  pumping: 'Refilling',
  empty: 'Empty',
};

export const SOIL_LABEL = ['Dry', 'Moist', 'Wet'];
export const LIGHT_LABEL = ['Dark', 'Normal', 'Bright'];

// One plain-language sentence describing what the greenhouse is doing right now
export function statusSentence(t, online) {
  if (!online) return 'The greenhouse is offline. Automation keeps running on the device.';
  if (!t) return 'Waiting for the first reading.';
  const out = t.out || {};
  const parts = [];
  if (out.fans || out.vents) parts.push('cooling with fans and vents');
  if (out.mist) parts.push('misting');
  if (out.drip) parts.push('watering the soil');
  if (out.refill) parts.push('refilling the tank');
  if (out.light) parts.push('grow light on');
  if (!parts.length) return 'Everything is steady. Nothing needs to run right now.';
  const s = parts.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}
