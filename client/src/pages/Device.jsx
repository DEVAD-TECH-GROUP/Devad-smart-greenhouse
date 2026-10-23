import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Cpu, Trash2, Wifi, WifiOff } from 'lucide-react';
import { api } from '../lib/api.js';
import { useDevices } from '../context/DevicesContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import GreenhouseDiagram from '../components/GreenhouseDiagram.jsx';
import Readings from '../components/Readings.jsx';
import Switchboard from '../components/Switchboard.jsx';
import HistoryCharts from '../components/HistoryCharts.jsx';
import ActivityFeed from '../components/ActivityFeed.jsx';
import SettingsForm from '../components/SettingsForm.jsx';
import { statusSentence, timeAgo } from '../lib/format.js';

const TABS = [
  { key: 'live', label: 'Live' },
  { key: 'activity', label: 'Activity' },
  { key: 'settings', label: 'Settings' },
];

function DevicePanel({ device }) {
  const { patch, remove } = useDevices();
  const toast = useToast();
  const nav = useNavigate();
  const [name, setName] = useState(device.name);
  const [location, setLocation] = useState(device.location || '');
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await api(`/devices/${device.deviceId}`, { method: 'PATCH', body: { name, location } });
      patch(device.deviceId, { name: d.device.name, location: d.device.location });
      toast.ok('Details saved.');
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const unlink = async () => {
    if (!window.confirm(`Remove "${device.name}" and delete its history? The device itself is not affected and can be linked again.`)) return;
    try {
      await api(`/devices/${device.deviceId}`, { method: 'DELETE' });
      remove(device.deviceId);
      toast.ok('Greenhouse removed.');
      nav('/');
    } catch (err) { toast.error(err.message); }
  };

  const info = device.info;
  return (
    <section className="panel p-6">
      <h2 className="font-display text-2xl font-semibold">Device</h2>
      <form onSubmit={save} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="text-sm font-medium">Name</span>
          <input className="field mt-1.5" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></label>
        <label className="block"><span className="text-sm font-medium">Location</span>
          <input className="field mt-1.5" value={location} onChange={(e) => setLocation(e.target.value)} /></label>
        <div className="sm:col-span-2"><button className="btn btn-ghost" disabled={busy}>Save details</button></div>
      </form>

      <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        <div><dt className="text-chalk-dim">Device ID</dt><dd className="font-mono">{device.deviceId}</dd></div>
        <div><dt className="text-chalk-dim">Firmware</dt><dd>{info?.fw ? `v${info.fw}` : 'Unknown'}</dd></div>
        <div><dt className="text-chalk-dim">WiFi network</dt><dd>{info?.ssid || 'Unknown'}</dd></div>
        <div><dt className="text-chalk-dim">Signal</dt><dd>{device.telemetry?.rssi != null ? `${device.telemetry.rssi} dBm` : 'Unknown'}</dd></div>
        <div><dt className="text-chalk-dim">Linked</dt><dd>{new Date(device.claimedAt).toLocaleDateString()}</dd></div>
        <div><dt className="text-chalk-dim">Free memory</dt><dd>{device.telemetry?.heap ? `${Math.round(device.telemetry.heap / 1024)} KB` : 'Unknown'}</dd></div>
      </dl>

      <div className="mt-8 border-t border-chalk-dim/10 pt-6">
        <button className="btn btn-danger" onClick={unlink}><Trash2 size={17} /> Remove greenhouse</button>
      </div>
    </section>
  );
}

export default function Device() {
  const { deviceId } = useParams();
  const { devices, loading, patch } = useDevices();
  const [tab, setTab] = useState('live');
  const [, tick] = useState(0);
  const device = devices.find((d) => d.deviceId === deviceId?.toUpperCase());

  // keep "last seen" fresh
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <p className="py-24 text-center text-chalk-dim">Loading…</p>;
  if (!device) return <p className="py-24 text-center text-chalk-dim">We could not find that greenhouse.</p>;

  const t = device.telemetry;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <section className="panel gh-enter grid items-center gap-6 overflow-hidden p-6 sm:p-8 lg:grid-cols-[1fr_1.25fr]">
        <div>
          <p className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${device.online ? 'bg-leaf/15 text-leaf' : 'bg-chalk-dim/10 text-chalk-dim'}`}>
            {device.online ? <Wifi size={15} /> : <WifiOff size={15} />}
            {device.online ? 'Online' : `Offline · seen ${timeAgo(t?.ts ?? device.lastSeenAt)}`}
          </p>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{device.name}</h1>
          {device.location && <p className="mt-1 text-chalk-dim">{device.location}</p>}

          <p className="mt-8 font-display text-7xl font-semibold leading-none tracking-tight sm:text-8xl">
            {t ? t.temp.toFixed(1) : '–'}<span className="text-3xl font-normal text-chalk-dim sm:text-4xl">°C</span>
          </p>
          <p className="mt-4 flex max-w-sm items-start gap-2 text-chalk-dim">
            <Cpu size={18} className="mt-0.5 shrink-0" />
            <span>{statusSentence(t, device.online)}</span>
          </p>
        </div>
        <GreenhouseDiagram telemetry={t} online={device.online} className="w-full" />
      </section>

      <Readings telemetry={t} />

      <div role="tablist" aria-label="Greenhouse sections" className="flex gap-1 border-b border-chalk-dim/10">
        {TABS.map((x) => (
          <button
            key={x.key}
            role="tab"
            aria-selected={tab === x.key}
            onClick={() => setTab(x.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${tab === x.key ? 'border-leaf text-chalk' : 'border-transparent text-chalk-dim hover:text-chalk'}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'live' && (
        <>
          <Switchboard device={device} />
          <HistoryCharts deviceId={device.deviceId} />
        </>
      )}
      {tab === 'activity' && <ActivityFeed deviceId={device.deviceId} />}
      {tab === 'settings' && (
        <>
          <SettingsForm device={device} onSaved={(s) => patch(device.deviceId, { settings: s })} />
          <DevicePanel device={device} />
        </>
      )}
    </div>
  );
}
