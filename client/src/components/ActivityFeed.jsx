import { useEffect, useState } from 'react';
import { AlertTriangle, Hand, Info, Settings2, XOctagon } from 'lucide-react';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { dayClock } from '../lib/format.js';

function Icon({ item }) {
  const p = { size: 18 };
  if (item.level === 'error') return <XOctagon {...p} className="text-bloom" />;
  if (item.level === 'warn') return <AlertTriangle {...p} className="text-sun" />;
  if (item.type === 'override') return <Hand {...p} className="text-sun" />;
  if (item.type === 'settings') return <Settings2 {...p} className="text-mist" />;
  return <Info {...p} className="text-chalk-dim" />;
}

export default function ActivityFeed({ deviceId }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    let live = true;
    setItems(null);
    api(`/devices/${deviceId}/activity?limit=60`)
      .then((d) => live && setItems(d.items))
      .catch(() => live && setItems([]));

    const socket = getSocket();
    const onActivity = (a) => {
      if (a.deviceId !== deviceId) return;
      setItems((l) => [{ id: a.id, type: a.type, level: a.level, message: a.message, createdAt: a.createdAt }, ...(l || [])].slice(0, 100));
    };
    socket.on('activity', onActivity);
    return () => { live = false; socket.off('activity', onActivity); };
  }, [deviceId]);

  return (
    <section className="panel p-6">
      <h2 className="font-display text-2xl font-semibold">Activity</h2>
      <p className="mt-1 text-sm text-chalk-dim">Alerts, overrides and settings changes, newest first.</p>
      {items === null ? (
        <p className="py-10 text-center text-chalk-dim">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-chalk-dim">Nothing yet. Alerts and manual overrides will show up here.</p>
      ) : (
        <ol className="mt-4 max-h-[28rem] space-y-1 overflow-y-auto pr-1">
          {items.map((a) => (
            <li key={a.id} className="flex gap-3 rounded-xl px-3 py-2.5 hover:bg-chalk-dim/5">
              <span className="mt-0.5 shrink-0"><Icon item={a} /></span>
              <div className="min-w-0">
                <p className="text-sm">{a.message}</p>
                <p className="text-xs text-chalk-dim">{dayClock(a.createdAt)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
