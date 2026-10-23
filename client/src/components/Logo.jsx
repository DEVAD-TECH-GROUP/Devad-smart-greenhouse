import { Sprout } from 'lucide-react';

export default function Logo({ size = 22 }) {
  return (
    <span className="inline-flex items-center gap-3 text-emerald-50">
      <span className="relative grid place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-lime-300 p-2 text-[#04110c] shadow-[0_8px_30px_-6px_rgba(52,211,153,0.6)]">
        <Sprout size={size} strokeWidth={2.4} />
        <span className="absolute -right-1 -top-1 flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-[#050f0b] bg-emerald-300" />
        </span>
      </span>
      <span className="flex flex-col leading-none">
        <span className="gh-display text-xl font-semibold tracking-tight">DEVAD</span>
        <span className="gh-mono mt-1 text-[10px] uppercase tracking-[0.25em] text-emerald-300/70">SMART GREENHOUSE</span>
      </span>
    </span>
  );
}
