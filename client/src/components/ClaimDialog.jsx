import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useDevices } from '../context/DevicesContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function ClaimDialog({ open, onClose, onClaimed }) {
  const { add } = useDevices();
  const toast = useToast();
  const [form, setForm] = useState({ deviceId: '', claimCode: '', name: '', location: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const first = useRef(null);

  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const d = await api('/devices/claim', { method: 'POST', body: form });
      add(d.device);
      toast.ok(`${d.device.name} is now linked to your account.`);
      setForm({ deviceId: '', claimCode: '', name: '', location: '' });
      onClaimed?.(d.device);
      onClose();
    } catch (err) {
      setErrors(err.fields || {});
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-fern-950/80 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="claim-title" className="panel my-8 w-full max-w-xl p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <h2 id="claim-title" className="font-display text-3xl font-semibold">Add Greenhouse</h2>
          <button className="btn btn-ghost !p-2" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm text-chalk-dim marker:text-leaf">
          <li>Power on your ESP32 device. If it isn't connected to Wi-Fi, it will create a setup hotspot named <b className="text-chalk">Greenhouse-XXXXXX</b>.</li>
          <li>Connect your phone to this hotspot, then follow the setup instructions to connect your device to your Wi-Fi network.</li>
          <li>Find your <b className="text-chalk">Device ID</b> and <b className="text-chalk">claim code</b> on the setup page, then enter them below to register your greenhouse.</li>
        </ol>

        <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Device ID</span>
            <input ref={first} className="field mt-1.5 uppercase" placeholder="GH-A1B2C3" value={form.deviceId} onChange={set('deviceId')} aria-invalid={!!errors.deviceId} required />
            {errors.deviceId && <span className="mt-1 block text-xs text-bloom">{errors.deviceId[0]}</span>}
          </label>
          <label className="block">
            <span className="text-sm font-medium">Claim code</span>
            <input className="field mt-1.5 tracking-widest" inputMode="numeric" maxLength={6} placeholder="123456" value={form.claimCode} onChange={set('claimCode')} aria-invalid={!!errors.claimCode} required />
            {errors.claimCode && <span className="mt-1 block text-xs text-bloom">{errors.claimCode[0]}</span>}
          </label>
          <label className="block">
            <span className="text-sm font-medium">Greenhouse Name</span>
            <input className="field mt-1.5" placeholder="e.g Tomato Greenhouse" value={form.name} onChange={set('name')} aria-invalid={!!errors.name} required />
            {errors.name && <span className="mt-1 block text-xs text-bloom">{errors.name[0]}</span>}
          </label>
          <label className="block">
            <span className="text-sm font-medium">Location <span className="text-chalk-dim">(optional)</span></span>
            <input className="field mt-1.5" placeholder="e.g Backyard garden" value={form.location} onChange={set('location')} />
          </label>
          <div className="flex gap-3 sm:col-span-2">
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Connecting…' : 'Connect greenhouse'}</button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
