
import { Activity, Droplets, Smartphone, Cpu } from 'lucide-react';
import Logo from './Logo.jsx';
import GreenhouseDiagram from './GreenhouseDiagram.jsx';

const DEMO = {
  tank: 'pumping',
  out: { fans: true, vents: true, drip: true, mist: true, refill: true, light: false },
};

// Feature cards displayed around the demo schematic.
const FEATURES = [
  { icon: Activity, label: 'Live Monitoring' },
  { icon: Droplets, label: 'Smart Irrigation' },
  { icon: Smartphone, label: 'Remote Control' },
];

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="gh-root relative min-h-screen overflow-hidden bg-[#050f0b] text-emerald-50">
      {/* ambient background */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="gh-aurora absolute -left-40 -top-40 h-[36rem] w-[36rem] rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="gh-aurora absolute -bottom-48 left-1/3 h-[32rem] w-[32rem] rounded-full bg-lime-400/10 blur-3xl [animation-delay:-6s]" />
        <div className="gh-aurora absolute -right-32 top-1/4 h-[28rem] w-[28rem] rounded-full bg-sky-500/10 blur-3xl [animation-delay:-12s]" />
        <div className="gh-grid absolute inset-0" />
      </div>

      <div className="relative grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
        {/* showcase panel */}
        <aside className="relative hidden flex-col justify-between gap-10 p-10 lg:flex xl:p-14">
          <div className="flex items-center justify-between">
            <Logo />
            <span className="gh-mono inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-emerald-200/80 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_2px_rgba(110,231,183,0.8)]" />
              REAL-TIME MONITORING
            </span>
          </div>

          <div className="gh-enter">
            <h1 className="gh-display max-w-xl text-5xl font-semibold leading-[1.04] tracking-tight 2xl:text-6xl">
              Tend your greenhouse{' '}
              <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-lime-300 bg-clip-text text-transparent">
                from anywhere.
              </span>
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-emerald-100/60">
              Monitor growing conditions in real time. Manage irrigation, ventilation, misting and grow lights from one intelligent dashboard, wherever you are.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {FEATURES.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-xl"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300">
                    <Icon size={18} />
                  </span>
                  <span className="text-sm font-medium text-emerald-50">
                    {label}
                  </span>
                </div>
              ))}
            </div>

            <div className="relative mt-8 max-w-2xl">
              <div className="rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-2 shadow-[0_40px_120px_-40px_rgba(16,185,129,0.55)] backdrop-blur-xl">
                <div className="flex items-center justify-between px-4 pb-1 pt-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                  </div>
                  <span className="gh-mono text-[11px] uppercase tracking-[0.2em] text-emerald-100/50">Live preview · Bay 01</span>
                </div>
                <div className="rounded-[22px] border border-white/5 bg-[#04110c]/80 p-3">
                  <GreenhouseDiagram telemetry={DEMO} className="w-full" />
                </div>
              </div>

            </div>
          </div>

          <p className="flex items-center gap-2 text-sm text-emerald-100/50">
            <Cpu size={16} className="text-emerald-300/70" />
            Built for ESP32-powered greenhouse automation.
          </p>
        </aside>

        {/* form panel */}
        <main className="relative flex items-center justify-center px-5 py-12 sm:px-8">
          <div className="gh-enter w-full max-w-md">
            <div className="mb-8 lg:hidden"><Logo /></div>

            <div className="relative rounded-[28px] border border-white/10 bg-white/[0.04] p-7 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur-2xl sm:p-9">
              <div aria-hidden className="absolute inset-x-10 -top-px h-px bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent" />
              <h2 className="gh-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
              <p className="mt-2 text-emerald-100/60">{subtitle}</p>
              <div className="mt-8">{children}</div>
            </div>

            <p className="mt-6 text-center text-sm text-emerald-100/50">{footer}</p>

            <div className="mt-10 rounded-3xl border border-white/10 bg-[#04110c]/70 p-3 lg:hidden">
              <p className="gh-mono px-2 pb-2 text-[10px] uppercase tracking-[0.2em] text-emerald-100/50">Live preview · Bay 01</p>
              <GreenhouseDiagram telemetry={DEMO} className="w-full" />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

