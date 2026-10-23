import { useEffect, useRef, useState } from 'react';
import { Fan, Wind, Droplets, Waves, Lightbulb, CloudFog, Loader2, ShieldAlert } from 'lucide-react';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';

const ROWS = [
  { key: 'fans', label: 'Blower fans', hint: 'Pull hot air out of the greenhouse', icon: Fan },
  { key: 'vents', label: 'Roof vents', hint: 'Open the servo-driven roof flaps', icon: Wind },
  { key: 'mist', label: 'Mist sprayer', hint: 'Cool the air with a short spray', icon: CloudFog, pump: true },
  { key: 'drip', label: 'Drip irrigation', hint: 'Water the soil from the tank', icon: Droplets, pump: true },
  { key: 'refill', label: 'Tank refill pump', hint: 'Top up the water tank', icon: Waves, pump: true },
  { key: 'light', label: 'Grow light', hint: 'Light the plants when it is dark', icon: Lightbulb },
];

const MODES = [
  { key: 'auto', label: 'Auto' },
  { key: 'on', label: 'On' },
  { key: 'off', label: 'Off' },
];

export default function Switchboard({ device }) {
  const toast = useToast();
  const t = device.telemetry;
  const enabled = device.online && !!t;
  const [pending, setPending] = useState({}); // actuator -> requested mode
  const timers = useRef({});

  // clear a pending marker as soon as the device confirms the mode
  useEffect(() => {
    if (!t?.mode) return;
    setPending((p) => {
      const next = { ...p };
      let changed = false;
      for (const k of Object.keys(p)) {
        if (t.mode[k] === p[k]) { delete next[k]; changed = true; clearTimeout(timers.current[k]); }
      }
      return changed ? next : p;
    });
  }, [t]);

  const send = async (actuator, mode) => {
    if (t?.mode?.[actuator] === mode) return;
    setPending((p) => ({ ...p, [actuator]: mode }));
    clearTimeout(timers.current[actuator]);
    timers.current[actuator] = setTimeout(() => {
      setPending((p) => { const n = { ...p }; delete n[actuator]; return n; });
    }, 8000);
    try {
      await api(`/devices/${device.deviceId}/control`, { method: 'POST', body: { actuator, mode } });
    } catch (e) {
      setPending((p) => { const n = { ...p }; delete n[actuator]; return n; });
      toast.error(e.message);
    }
  };

  const manualMin = device.settings?.manualMaxMin;

  return (
    <section className="panel overflow-hidden">
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-6 pt-5">
        <div>
          <h2 className="font-display text-2xl font-semibold">Manual override</h2>
          <p className="mt-1 text-sm text-chalk-dim">
            Take control of any part of the greenhouse. Auto hands it back to the sensors.
          </p>
        </div>
        {!enabled && <p className="text-sm text-sun">Controls unlock when the greenhouse is online.</p>}
      </header>

      <ul className="mt-4 divide-y divide-chalk-dim/10">
        {ROWS.map(({ key, label, hint, icon: Icon, pump }) => {
          const mode = pending[key] ?? t?.mode?.[key] ?? 'auto';
          const running = !!t?.out?.[key];
          const locked = !!t?.lock?.[key];
          const manual = mode !== 'auto';
          return (
            <li key={key} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-4">
              <span className={`grid size-11 shrink-0 place-items-center rounded-xl transition-colors ${running ? 'bg-mist/20 text-mist' : 'bg-chalk-dim/10 text-chalk-dim'}`}>
                <Icon size={21} className={running && key === 'fans' ? 'gh-spin' : ''} />
              </span>

              <div className="min-w-[10rem] flex-1">
                <p className="font-semibold">{label}</p>
                <p className="text-sm text-chalk-dim">
                  {locked ? (
                    <span className="inline-flex items-center gap-1.5 text-bloom">
                      <ShieldAlert size={14} /> Held off by a safety lock
                    </span>
                  ) : (
                    <>
                      {running ? 'Running' : 'Stopped'}
                      {manual ? <span className="text-sun"> · manual</span> : <span> · automatic</span>}
                    </>
                  )}
                </p>
                {!manual && <p className="hidden text-xs text-chalk-dim/70 sm:block">{hint}</p>}
                {manual && pump && manualMin > 0 && (
                  <p className="text-xs text-chalk-dim/70">Returns to Auto after {manualMin} min</p>
                )}
              </div>

              <div role="group" aria-label={`${label} mode`} className="flex rounded-xl bg-fern-950/70 p-1">
                {MODES.map((m) => {
                  const active = mode === m.key;
                  const waiting = pending[key] === m.key;
                  const tone = !active ? 'text-chalk-dim hover:text-chalk'
                    : m.key === 'auto' ? 'bg-leaf text-fern-950'
                    : 'bg-sun text-fern-950';
                  return (
                    <button
                      key={m.key}
                      type="button"
                      disabled={!enabled}
                      aria-pressed={active}
                      onClick={() => send(key, m.key)}
                      className={`inline-flex min-w-[3.6rem] items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${tone}`}
                    >
                      {waiting && <Loader2 size={13} className="animate-spin" />}
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
