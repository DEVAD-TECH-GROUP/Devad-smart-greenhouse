import { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../lib/api.js';
import { clock, dayClock } from '../lib/format.js';

const RANGES = ['1h', '6h', '24h', '7d', '30d'];

const tooltipStyle = {
  background: '#0b1b16',
  border: '1px solid rgba(163,184,170,.25)',
  borderRadius: 12,
  color: '#e9f0e4',
  fontSize: 13,
};

function Chart({ title, children, legend }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-semibold">{title}</h3>
        <div className="flex gap-4 text-xs text-chalk-dim">{legend}</div>
      </div>
      <div className="h-56">{children}</div>
    </div>
  );
}

const Dot = ({ color, label }) => (
  <span className="inline-flex items-center gap-1.5"><i className="inline-block size-2 rounded-full" style={{ background: color }} />{label}</span>
);

export default function HistoryCharts({ deviceId }) {
  const [range, setRange] = useState('24h');
  const [points, setPoints] = useState(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      api(`/devices/${deviceId}/history?range=${range}`)
        .then((d) => live && setPoints(d.points))
        .catch(() => live && setPoints([]));
    setPoints(null);
    load();
    const id = setInterval(load, 60_000);
    return () => { live = false; clearInterval(id); };
  }, [deviceId, range]);

  const short = range === '1h' || range === '6h' || range === '24h';
  const fmt = (t) => (short ? clock(t) : dayClock(t));
  const axis = { stroke: '#a3b8aa', fontSize: 12, tickLine: false, axisLine: false };

  return (
    <section className="panel p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold">History</h2>
        <div role="group" aria-label="Time range" className="flex rounded-xl bg-fern-950/70 p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              onClick={() => setRange(r)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${range === r ? 'bg-chalk text-fern-950' : 'text-chalk-dim hover:text-chalk'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </header>

      {points === null ? (
        <p className="py-16 text-center text-chalk-dim">Loading history…</p>
      ) : points.length < 2 ? (
        <p className="py-16 text-center text-chalk-dim">
          History appears here once the greenhouse has reported for a few minutes.
        </p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <Chart title="Temperature and humidity" legend={<><Dot color="#f3b53f" label="Temp °C" /><Dot color="#86d9cb" label="Humidity %" /></>}>
            <ResponsiveContainer>
              <AreaChart data={points} margin={{ left: -18, right: 4, top: 6 }}>
                <defs>
                  <linearGradient id="gTemp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#f3b53f" stopOpacity={0.35} />
                    <stop offset="1" stopColor="#f3b53f" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#a3b8aa" strokeOpacity={0.1} vertical={false} />
                <XAxis dataKey="t" tickFormatter={fmt} {...axis} minTickGap={40} />
                <YAxis {...axis} domain={['auto', 'auto']} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={dayClock} />
                <Area type="monotone" dataKey="temp" name="Temp °C" stroke="#f3b53f" strokeWidth={2.5} fill="url(#gTemp)" dot={false} />
                <Line type="monotone" dataKey="hum" name="Humidity %" stroke="#86d9cb" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Chart>

          <Chart title="Soil moisture and light" legend={<><Dot color="#9bd36a" label="Soil %" /><Dot color="#e9f0e4" label="Light reading" /></>}>
            <ResponsiveContainer>
              <LineChart data={points} margin={{ left: -18, right: -10, top: 6 }}>
                <CartesianGrid stroke="#a3b8aa" strokeOpacity={0.1} vertical={false} />
                <XAxis dataKey="t" tickFormatter={fmt} {...axis} minTickGap={40} />
                <YAxis yAxisId="soil" domain={[0, 100]} {...axis} />
                <YAxis yAxisId="ldr" orientation="right" domain={[0, 1023]} {...axis} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={dayClock} />
                <Line yAxisId="soil" type="monotone" dataKey="soil" name="Soil %" stroke="#9bd36a" strokeWidth={2.5} dot={false} />
                <Line yAxisId="ldr" type="monotone" dataKey="ldr" name="Light reading" stroke="#e9f0e4" strokeOpacity={0.7} strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Chart>
        </div>
      )}
    </section>
  );
}
