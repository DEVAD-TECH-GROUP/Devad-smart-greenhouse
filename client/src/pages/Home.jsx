import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useDevices } from '../context/DevicesContext.jsx';
import GreenhouseDiagram from '../components/GreenhouseDiagram.jsx';
import ClaimDialog from '../components/ClaimDialog.jsx';
import { TANK_LABEL, timeAgo } from '../lib/format.js';

export default function Home() {
  const { user } = useAuth();
  const { devices, loading } = useDevices();
  const [claiming, setClaiming] = useState(false);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-chalk-dim">Welcome back, {user?.name?.split(' ')[0]}</p>
          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Greenhouse Dashboard</h1>
        </div>
        {devices.length > 0 && (
          <button className="btn btn-primary" onClick={() => setClaiming(true)}><Plus size={18} /> Add Greenhouse</button>
        )}
      </div>

      {loading ? (
        <p className="mt-16 text-center text-chalk-dim">Loading…</p>
      ) : devices.length === 0 ? (
        <section className="panel mt-10 grid items-center gap-8 p-8 lg:grid-cols-2 lg:p-12">
          <div>
            <h2 className="font-display text-3xl font-semibold">Connect Your First Greenhouse</h2>
            <p className="mt-3 max-w-md text-chalk-dim">
              Set up your ESP32 device, connect to its setup network, and register your greenhouse using its Device ID and claim code.
            </p>
            <button className="btn btn-primary mt-6" onClick={() => setClaiming(true)}><Plus size={18} /> Add greenhouse</button>
          </div>
          <GreenhouseDiagram telemetry={{ tank: 'idle', out: {} }} className="w-full" />
        </section>
      ) : (
        <ul className="panel mt-8 divide-y divide-chalk-dim/10 overflow-hidden">
          {devices.map((d) => {
            const t = d.telemetry;
            return (
              <li key={d.deviceId}>
                <Link to={`/greenhouse/${d.deviceId}`} className="flex flex-wrap items-center gap-x-8 gap-y-3 px-6 py-5 transition-colors hover:bg-chalk-dim/5">
                  <div className="min-w-[12rem] flex-1">
                    <p className="font-display text-2xl font-semibold">{d.name}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-sm text-chalk-dim">
                      <span className={`size-2 rounded-full ${d.online ? 'bg-leaf' : 'bg-chalk-dim/40'}`} />
                      {d.online ? 'Connected' : `Disconnected. last Active ${timeAgo(d.lastSeenAt)}`}
                      {d.location && <span>· {d.location}</span>}
                    </p>
                  </div>
                  <dl className="flex gap-8 text-sm">
                    <div><dt className="text-chalk-dim">Air Temperature</dt><dd className="font-display text-2xl font-semibold">{t ? `${t.temp.toFixed(1)}°` : '–'}</dd></div>
                    <div><dt className="text-chalk-dim">Soil Moisture</dt><dd className="font-display text-2xl font-semibold">{t ? `${t.soil}%` : '–'}</dd></div>
                    <div><dt className="text-chalk-dim">Water Tank</dt><dd className="font-display text-2xl font-semibold">{t ? TANK_LABEL[t.tank] : '–'}</dd></div>
                  </dl>
                  <ChevronRight className="text-chalk-dim" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <ClaimDialog open={claiming} onClose={() => setClaiming(false)} />
    </div>
  );
}
