import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { api } from "../lib/api.js";
import { useToast } from "../context/ToastContext.jsx";

const DEFAULTS = {
  tempHigh: 34,
  tempHyst: 2,
  ldrBright: 1000,
  ldrDark: 1020,
  soilDry: 850,
  soilWet: 300,
  tankEmpty: 300,
  tankFilling: 400,
  topFull: 300,
  mistSec: 20,
  manualMaxMin: 10,
};

const GROUPS = [
  {
    title: "Cooling",
    fields: [
      {
        k: "tempHigh",
        label: "Start cooling above",
        unit: "°C",
        step: 0.5,
        hint: "Fans, vents and a mist burst start here.",
      },
      {
        k: "tempHyst",
        label: "Stop cooling this far below",
        unit: "°C",
        step: 0.5,
        hint: "Prevents rapid on/off switching.",
      },
      {
        k: "mistSec",
        label: "Mist burst length",
        unit: "sec",
        step: 1,
        hint: "How long the mist sprayer runs per cooling cycle.",
      },
    ],
  },
  {
    title: "Grow light",
    fields: [
      {
        k: "ldrDark",
        label: "Turn on above reading",
        unit: "",
        step: 1,
        hint: "Higher reading means darker. Max 1023.",
      },
      {
        k: "ldrBright",
        label: "Turn off below reading",
        unit: "",
        step: 1,
        hint: "Must be lower than the turn-on reading.",
      },
    ],
  },
  {
    title: "Soil moisture",
    fields: [
      {
        k: "soilDry",
        label: "Reading when bone dry",
        unit: "",
        step: 1,
        hint: "Sensor value in dry air, counts as 0%.",
      },
      {
        k: "soilWet",
        label: "Reading when soaked",
        unit: "",
        step: 1,
        hint: "Sensor value in water, counts as 100%.",
      },
    ],
  },
  {
    title: "Water tank",
    fields: [
      {
        k: "tankEmpty",
        label: "Empty below reading",
        unit: "",
        step: 1,
        hint: "Lower sensor under this starts a refill.",
      },
      {
        k: "tankFilling",
        label: "Refilling above reading",
        unit: "",
        step: 1,
        hint: "Lower sensor over this shows refilling.",
      },
      {
        k: "topFull",
        label: "Full above reading",
        unit: "",
        step: 1,
        hint: "Upper sensor over this stops the refill pump.",
      },
    ],
  },
  {
    title: "Safety",
    fields: [
      {
        k: "manualMaxMin",
        label: "Manual pump limit",
        unit: "min",
        step: 1,
        hint: "Pumps forced On return to Auto after this long. 0 turns the limit off.",
      },
    ],
  },
];

export default function SettingsForm({ device, onSaved }) {
  const toast = useToast();

  const canControl =
    device.permissions?.isOwner === true ||
    device.permissions?.canControl === true;

  const [form, setForm] = useState({
    ...DEFAULTS,
    ...(device.settings || {}),
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setForm({
      ...DEFAULTS,
      ...(device.settings || {}),
    });
    setErrors({});
  }, [device.deviceId, device.settings]);

  const set = (key, value) => {
    if (!canControl) return;

    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const save = async (event) => {
    event.preventDefault();

    if (!canControl) {
      toast.error("You do not have permission to change these settings.");
      return;
    }

    setSaving(true);
    setErrors({});

    try {
      const body = Object.fromEntries(
        Object.entries(form).map(([key, value]) => [key, Number(value)]),
      );

      const result = await api(`/devices/${device.deviceId}/settings`, {
        method: "PUT",
        body,
      });

      onSaved?.(result.settings);

      toast.ok(
        "Settings saved. The greenhouse applies them within a few seconds.",
      );
    } catch (error) {
      setErrors(error.fields || {});
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const restoreDefaults = () => {
    if (!canControl) return;

    setForm({ ...DEFAULTS });
    setErrors({});
  };

  return (
    <form onSubmit={save} className="panel p-6">
      <h2 className="font-display text-2xl font-semibold">
        Automation settings
      </h2>

      <p className="mt-1 text-sm text-chalk-dim">
        These thresholds are stored on the greenhouse, so they keep working
        without WiFi.
      </p>

      {!canControl && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-chalk-dim/15 p-3 text-sm text-chalk-dim">
          <Eye size={17} className="mt-0.5 shrink-0" />
          <p>
            You have view-only access. You can inspect these values but cannot
            edit or save automation settings. Ask the greenhouse owner to enable
            control permission if needed.
          </p>
        </div>
      )}

      <div className="mt-6 space-y-8">
        {GROUPS.map((group) => (
          <fieldset key={group.title} disabled={!canControl || saving}>
            <legend className="mb-3 font-semibold text-mist">
              {group.title}
            </legend>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.fields.map((field) => (
                <label key={field.k} className="block">
                  <span className="text-sm font-medium">
                    {field.label}
                    {field.unit && (
                      <span className="text-chalk-dim"> ({field.unit})</span>
                    )}
                  </span>

                  <input
                    type="number"
                    step={field.step}
                    className="field mt-1.5 disabled:cursor-not-allowed disabled:opacity-60"
                    value={form[field.k]}
                    aria-invalid={Boolean(errors[field.k])}
                    onChange={(event) => set(field.k, event.target.value)}
                    readOnly={!canControl}
                    required
                  />

                  <span
                    className={`mt-1 block text-xs ${
                      errors[field.k] ? "text-bloom" : "text-chalk-dim"
                    }`}
                  >
                    {errors[field.k]?.[0] || field.hint}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      {canControl && (
        <div className="mt-8 flex flex-wrap gap-3">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={restoreDefaults}
            disabled={saving}
          >
            Restore defaults
          </button>
        </div>
      )}
    </form>
  );
}
