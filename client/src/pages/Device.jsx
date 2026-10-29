import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Cpu,
  Trash2,
  Wifi,
  WifiOff,
  Users,
  UserPlus,
  ShieldCheck,
  Eye,
  SlidersHorizontal,
  RefreshCw,
} from "lucide-react";
import { api } from "../lib/api.js";
import { useDevices } from "../context/DevicesContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import GreenhouseDiagram from "../components/GreenhouseDiagram.jsx";
import Readings from "../components/Readings.jsx";
import Switchboard from "../components/Switchboard.jsx";
import HistoryCharts from "../components/HistoryCharts.jsx";
import ActivityFeed from "../components/ActivityFeed.jsx";
import SettingsForm from "../components/SettingsForm.jsx";
import { statusSentence, timeAgo } from "../lib/format.js";

const TABS = [
  { key: "live", label: "Live" },
  { key: "activity", label: "Activity" },
  { key: "settings", label: "Settings" },
];

function PermissionBadge({ isOwner, canControl }) {
  if (isOwner) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-leaf/15 px-3 py-1 text-xs font-semibold text-leaf">
        <ShieldCheck size={14} />
        Owner access
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-chalk-dim/10 px-3 py-1 text-xs font-semibold text-chalk-dim">
      {canControl ? <SlidersHorizontal size={14} /> : <Eye size={14} />}
      {canControl ? "Viewer · Control enabled" : "View only"}
    </span>
  );
}

// --------------------------------------------------
// Owner-only greenhouse details
// --------------------------------------------------

function DevicePanel({ device }) {
  const { patch, remove } = useDevices();
  const toast = useToast();
  const nav = useNavigate();

  const [name, setName] = useState(device.name);
  const [location, setLocation] = useState(device.location || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(device.name);
    setLocation(device.location || "");
  }, [device.name, device.location]);

  const save = async (e) => {
    e.preventDefault();

    setBusy(true);

    try {
      const result = await api(`/devices/${device.deviceId}`, {
        method: "PATCH",
        body: { name, location },
      });

      patch(device.deviceId, {
        name: result.device.name,
        location: result.device.location,
      });

      toast.ok("Greenhouse details saved.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    const confirmed = window.confirm(
      `Remove "${device.name}" and delete its history? ` +
        "The physical device itself is not affected.",
    );

    if (!confirmed) return;

    setBusy(true);

    try {
      await api(`/devices/${device.deviceId}`, {
        method: "DELETE",
      });

      remove(device.deviceId);
      toast.ok("Greenhouse removed.");
      nav("/");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const info = device.info;

  return (
    <section className="panel p-6">
      <h2 className="font-display text-2xl font-semibold">
        Greenhouse Details
      </h2>

      <p className="mt-1 text-sm text-chalk-dim">
        Only the owner can change these details or remove this greenhouse.
      </p>

      <form onSubmit={save} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input
            className="field mt-1.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={60}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Location</span>
          <input
            className="field mt-1.5"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={80}
          />
        </label>

        <div className="sm:col-span-2">
          <button type="submit" className="btn btn-ghost" disabled={busy}>
            {busy ? "Saving…" : "Save details"}
          </button>
        </div>
      </form>

      <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-chalk-dim">Device ID</dt>
          <dd className="font-mono">{device.deviceId}</dd>
        </div>

        <div>
          <dt className="text-chalk-dim">Firmware</dt>
          <dd>{info?.fw ? `v${info.fw}` : "Unknown"}</dd>
        </div>

        <div>
          <dt className="text-chalk-dim">WiFi network</dt>
          <dd>{info?.ssid || "Unknown"}</dd>
        </div>

        <div>
          <dt className="text-chalk-dim">Signal</dt>
          <dd>
            {device.telemetry?.rssi != null
              ? `${device.telemetry.rssi} dBm`
              : "Unknown"}
          </dd>
        </div>

        <div>
          <dt className="text-chalk-dim">Linked</dt>
          <dd>
            {device.claimedAt
              ? new Date(device.claimedAt).toLocaleDateString()
              : "Unknown"}
          </dd>
        </div>

        <div>
          <dt className="text-chalk-dim">Free memory</dt>
          <dd>
            {device.telemetry?.heap
              ? `${Math.round(device.telemetry.heap / 1024)} KB`
              : "Unknown"}
          </dd>
        </div>
      </dl>

      <div className="mt-8 border-t border-chalk-dim/10 pt-6">
        <h3 className="font-semibold text-red-400">Danger Zone</h3>

        <p className="mt-1 text-sm text-chalk-dim">
          Removing this greenhouse also deletes its saved telemetry history and
          activity records.
        </p>

        <button
          type="button"
          className="btn btn-danger mt-4"
          onClick={unlink}
          disabled={busy}
        >
          <Trash2 size={17} />
          Remove greenhouse
        </button>
      </div>
    </section>
  );
}

// --------------------------------------------------
// Owner-only viewer management
// --------------------------------------------------

function ViewerManager({ deviceId }) {
  const toast = useToast();

  const [viewers, setViewers] = useState([]);
  const [email, setEmail] = useState("");
  const [canControl, setCanControl] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busyViewer, setBusyViewer] = useState("");

  const loadViewers = async () => {
    setLoading(true);

    try {
      const result = await api(`/devices/${deviceId}/viewers`);
      setViewers(result.viewers || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const result = await api(`/devices/${deviceId}/viewers`);

        if (active) {
          setViewers(result.viewers || []);
        }
      } catch (err) {
        if (active) {
          toast.error(err.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    setLoading(true);
    load();

    return () => {
      active = false;
    };
  }, [deviceId]);

  const addViewer = async (e) => {
    e.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) return;

    setAdding(true);

    try {
      const result = await api(`/devices/${deviceId}/viewers`, {
        method: "POST",
        body: {
          email: normalizedEmail,
          canControl,
        },
      });

      setViewers((current) => {
        const exists = current.some((viewer) => viewer.id === result.viewer.id);

        return exists
          ? current.map((viewer) =>
              viewer.id === result.viewer.id ? result.viewer : viewer,
            )
          : [...current, result.viewer];
      });

      setEmail("");
      setCanControl(false);

      toast.ok("Greenhouse access granted.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAdding(false);
    }
  };

  const toggleControl = async (viewer) => {
    setBusyViewer(viewer.id);

    try {
      const result = await api(`/devices/${deviceId}/viewers/${viewer.id}`, {
        method: "PATCH",
        body: {
          canControl: !viewer.canControl,
        },
      });

      setViewers((current) =>
        current.map((item) => (item.id === viewer.id ? result.viewer : item)),
      );

      toast.ok(
        result.viewer.canControl
          ? "Control access enabled."
          : "Control access disabled.",
      );
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyViewer("");
    }
  };

  const revokeAccess = async (viewer) => {
    const confirmed = window.confirm(
      `Revoke greenhouse access for ${viewer.email || viewer.name}?`,
    );

    if (!confirmed) return;

    setBusyViewer(viewer.id);

    try {
      await api(`/devices/${deviceId}/viewers/${viewer.id}`, {
        method: "DELETE",
      });

      setViewers((current) => current.filter((item) => item.id !== viewer.id));

      toast.ok("Viewer access revoked.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyViewer("");
    }
  };

  return (
    <section className="panel p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-2xl font-semibold">
            <Users size={22} className="text-leaf" />
            Viewer Management
          </h2>

          <p className="mt-1 text-sm text-chalk-dim">
            Share this greenhouse with registered users and manage what they can
            do.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-ghost"
          onClick={loadViewers}
          disabled={loading}
          aria-label="Refresh viewer list"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <form
        onSubmit={addViewer}
        className="mt-6 rounded-xl border border-chalk-dim/10 p-4"
      >
        <h3 className="font-semibold">Grant access</h3>

        <p className="mt-1 text-sm text-chalk-dim">
          Enter the email address the person used to register. This grants
          access directly; it does not send an invitation email.
        </p>

        <label className="mt-4 block">
          <span className="text-sm font-medium">Registered user's email</span>

          <input
            className="field mt-1.5"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="viewer@example.com"
            autoComplete="email"
            maxLength={254}
            required
          />
        </label>

        <label className="mt-4 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 accent-current"
            checked={canControl}
            onChange={(e) => setCanControl(e.target.checked)}
          />

          <span>
            <span className="block text-sm font-medium">
              Allow control and settings changes
            </span>

            <span className="mt-1 block text-xs text-chalk-dim">
              When unchecked, the user can view greenhouse readings, charts, and
              activity but cannot operate actuators or update automation
              settings.
            </span>
          </span>
        </label>

        <button
          type="submit"
          className="btn btn-primary mt-5"
          disabled={adding || !email.trim()}
        >
          <UserPlus size={17} />
          {adding ? "Granting access…" : "Grant access"}
        </button>
      </form>

      <div className="mt-7">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">People with access</h3>

          <span className="text-sm text-chalk-dim">
            {viewers.length} {viewers.length === 1 ? "person" : "people"}
          </span>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-chalk-dim">
            Loading viewers…
          </p>
        ) : viewers.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-chalk-dim/20 px-4 py-8 text-center">
            <Users size={26} className="mx-auto text-chalk-dim" />

            <p className="mt-3 font-medium">No viewers yet</p>

            <p className="mt-1 text-sm text-chalk-dim">
              Grant access to a registered user to share this greenhouse.
            </p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-chalk-dim/10">
            {viewers.map((viewer) => {
              const busy = busyViewer === viewer.id;

              return (
                <li
                  key={viewer.id}
                  className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="break-words font-medium">{viewer.name}</p>

                    <p className="break-all text-sm text-chalk-dim">
                      {viewer.email}
                    </p>

                    <span className="mt-2 inline-flex items-center gap-1.5 text-xs text-chalk-dim">
                      {viewer.canControl ? (
                        <>
                          <SlidersHorizontal size={13} />
                          Can control greenhouse
                        </>
                      ) : (
                        <>
                          <Eye size={13} />
                          View-only access
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => toggleControl(viewer)}
                      disabled={busy}
                    >
                      {viewer.canControl ? "Disable control" : "Enable control"}
                    </button>

                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => revokeAccess(viewer)}
                      disabled={busy}
                    >
                      <Trash2 size={15} />
                      Revoke
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

// --------------------------------------------------
// View-only settings information
// --------------------------------------------------

function ReadOnlySettings({ device }) {
  return (
    <section className="panel p-6">
      <div className="flex items-center gap-2">
        <Eye size={20} className="text-chalk-dim" />

        <h2 className="font-display text-2xl font-semibold">
          Automation Settings
        </h2>
      </div>

      <p className="mt-2 text-sm text-chalk-dim">
        You can view this greenhouse's settings, but only its owner or a viewer
        with control permission can change them.
      </p>

      {device.settings && Object.keys(device.settings).length > 0 ? (
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(device.settings).map(([key, value]) => (
            <div
              key={key}
              className="rounded-lg border border-chalk-dim/10 p-4"
            >
              <dt className="break-words text-sm text-chalk-dim">
                {key.replace(/([A-Z])/g, " $1")}
              </dt>

              <dd className="mt-1 font-display text-xl font-semibold">
                {String(value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-5 text-sm text-chalk-dim">
          No automation settings are available.
        </p>
      )}
    </section>
  );
}

// --------------------------------------------------
// Greenhouse detail page
// --------------------------------------------------

export default function Device() {
  const { deviceId } = useParams();
  const { devices, loading, patch } = useDevices();

  const [tab, setTab] = useState("live");
  const [, tick] = useState(0);

  const device = devices.find(
    (item) => item.deviceId === deviceId?.toUpperCase(),
  );

  // The server supplies these permission fields.
  // Missing permission data must not grant access by default.
  const isOwner = device?.permissions?.isOwner === true;

  const canControl = isOwner || device?.permissions?.canControl === true;

  // Keep relative "last seen" labels fresh.
  useEffect(() => {
    const id = setInterval(() => {
      tick((n) => n + 1);
    }, 15_000);

    return () => clearInterval(id);
  }, []);

  if (loading) {
    return <p className="py-24 text-center text-chalk-dim">Loading…</p>;
  }

  if (!device) {
    return (
      <p className="py-24 text-center text-chalk-dim">
        We could not find that greenhouse.
      </p>
    );
  }

  const t = device.telemetry;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      {/* Greenhouse overview */}
      <section className="panel gh-enter grid items-center gap-6 overflow-hidden p-6 sm:p-8 lg:grid-cols-[1fr_1.25fr]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
                device.online
                  ? "bg-leaf/15 text-leaf"
                  : "bg-chalk-dim/10 text-chalk-dim"
              }`}
            >
              {device.online ? <Wifi size={15} /> : <WifiOff size={15} />}

              {device.online
                ? "Online"
                : `Offline · seen ${timeAgo(t?.ts ?? device.lastSeenAt)}`}
            </p>

            <PermissionBadge isOwner={isOwner} canControl={canControl} />
          </div>

          <h1 className="mt-4 break-words font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            {device.name}
          </h1>

          {device.location && (
            <p className="mt-1 text-chalk-dim">{device.location}</p>
          )}

          {!isOwner && (
            <p className="mt-3 text-sm text-chalk-dim">
              This greenhouse is shared with you. Its owner manages greenhouse
              details and your access permissions.
            </p>
          )}

          <p className="mt-8 font-display text-7xl font-semibold leading-none tracking-tight sm:text-8xl">
            {t?.temp != null && Number.isFinite(Number(t.temp))
              ? Number(t.temp).toFixed(1)
              : "–"}

            <span className="text-3xl font-normal text-chalk-dim sm:text-4xl">
              °C
            </span>
          </p>

          <p className="mt-4 flex max-w-sm items-start gap-2 text-chalk-dim">
            <Cpu size={18} className="mt-0.5 shrink-0" />

            <span>{statusSentence(t, device.online)}</span>
          </p>
        </div>

        <GreenhouseDiagram
          telemetry={t}
          online={device.online}
          className="w-full"
        />
      </section>

      <Readings telemetry={t} />

      {/* Navigation tabs */}
      <div
        role="tablist"
        aria-label="Greenhouse sections"
        className="flex gap-1 overflow-x-auto border-b border-chalk-dim/10"
      >
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === item.key
                ? "border-leaf text-chalk"
                : "border-transparent text-chalk-dim hover:text-chalk"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Live monitoring */}
      {tab === "live" && (
        <>
          {canControl ? (
            <Switchboard device={device} />
          ) : (
            <section className="panel p-6">
              <div className="flex items-start gap-3">
                <Eye size={22} className="mt-0.5 shrink-0 text-chalk-dim" />

                <div>
                  <h2 className="font-display text-xl font-semibold">
                    View-only access
                  </h2>

                  <p className="mt-2 text-sm text-chalk-dim">
                    You can monitor live readings and history, but you cannot
                    operate greenhouse actuators. Ask the owner to enable
                    control access if you need it.
                  </p>
                </div>
              </div>
            </section>
          )}

          <HistoryCharts deviceId={device.deviceId} />
        </>
      )}

      {/* Activity history */}
      {tab === "activity" && <ActivityFeed deviceId={device.deviceId} />}

      {/* Settings and owner management */}
      {tab === "settings" && (
        <>
          {canControl ? (
            <SettingsForm
              device={device}
              onSaved={(settings) => patch(device.deviceId, { settings })}
            />
          ) : (
            <ReadOnlySettings device={device} />
          )}

          {isOwner && (
            <>
              <ViewerManager deviceId={device.deviceId} />
              <DevicePanel device={device} />
            </>
          )}
        </>
      )}
    </div>
  );
}
