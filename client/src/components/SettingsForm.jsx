import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';

const DEFAULTS = {
  tempHigh: 34, tempHyst: 2, ldrBright: 1000, ldrDark: 1020, soilDry: 850, soilWet: 300,
  tankEmpty: 300, tankFilling: 400, topFull: 300, mistSec: 20, manualMaxMin: 10,
};

const GROUPS = [
  {
    title: 'Cooling',
    fields: [
      { k: 'tempHigh', label: 'Start cooling above', unit: '°C', step: 0.5, hint: 'Fans, vents and a mist burst start here.' },
      { k: 'tempHyst', label: 'Stop cooling this far below', unit: '°C', step: 0.5, hint: 'Prevents rapid on/off switching.' },
      { k: 'mistSec', label: 'Mist burst length', unit: 'sec', step: 1, hint: 'How long the mist sprayer runs per cooling cycle.' },
    ],
  },
  {
    title: 'Grow light',
    fields: [
      { k: 'ldrDark', label: 'Turn on above reading', unit: '', step: 1, hint: 'Higher reading means darker. Max 1023.' },
      { k: 'ldrBright', label: 'Turn off below reading', unit: '', step: 1, hint: 'Must be lower than the turn-on reading.' },
    ],
  },
  {
    title: 'Soil moisture',
    fields: [
      { k: 'soilDry', label: 'Reading when bone dry', unit: '', step: 1, hint: 'Sensor value in dry air, counts as 0%.' },
      { k: 'soilWet', label: 'Reading when soaked', unit: '', step: 1, hint: 'Sensor value in water, counts as 100%.' },
    ],
  },
  {
    title: 'Water tank',
    fields: [
      { k: 'tankEmpty', label: 'Empty below reading', unit: '', step: 1, hint: 'Lower sensor under this starts a refill.' },
      { k: 'tankFilling', label: 'Refilling above reading', unit: '', step: 1, hint: 'Lower sensor over this shows refilling.' },
      { k: 'topFull', label: 'Full above reading', unit: '', step: 1, hint: 'Upper sensor over this stops the refill pump.' },
    ],
  },
  {
    title: 'Safety',
    fields: [
      { k: 'manualMaxMin', label: 'Manual pump limit', unit: 'min', step: 1, hint: 'Pumps forced On return to Auto after this long. 0 turns the limit off.' },
    ],
  },
];

export default function SettingsForm({ device, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ ...DEFAULTS, ...(device.settings || {}) });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => { setForm({ ...DEFAULTS, ...(device.settings || {}) }); }, [device.deviceId]); // eslint-disable-line

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v)]));
      const d = await api(`/devices/${device.deviceId}/settings`, { method: 'PUT', body });
      onSaved?.(d.settings);
      toast.ok('Settings saved. The greenhouse applies them within a few seconds.');
    } catch (err) {
      setErrors(err.fields || {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="panel p-6">
      <h2 className="font-display text-2xl font-semibold">Automation settings</h2>
      <p className="mt-1 text-sm text-chalk-dim">These thresholds are stored on the greenhouse, so they keep working without WiFi.</p>

      <div className="mt-6 space-y-8">
        {GROUPS.map((g) => (
          <fieldset key={g.title}>
            <legend className="mb-3 font-semibold text-mist">{g.title}</legend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {g.fields.map((f) => (
                <label key={f.k} className="block">
                  <span className="text-sm font-medium">{f.label}{f.unit && <span className="text-chalk-dim"> ({f.unit})</span>}</span>
                  <input
                    type="number"
                    step={f.step}
                    className="field mt-1.5"
                    value={form[f.k]}
                    aria-invalid={!!errors[f.k]}
                    onChange={(e) => set(f.k, e.target.value)}
                    required
                  />
                  <span className={`mt-1 block text-xs ${errors[f.k] ? 'text-bloom' : 'text-chalk-dim'}`}>
                    {errors[f.k]?.[0] || f.hint}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setForm({ ...DEFAULTS })}>Restore defaults</button>
      </div>
    </form>
  );
}
