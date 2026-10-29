import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  ChevronRight,
  House,
  Users,
  ShieldCheck,
  Eye,
  SlidersHorizontal,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useDevices } from "../context/DevicesContext.jsx";
import GreenhouseDiagram from "../components/GreenhouseDiagram.jsx";
import ClaimDialog from "../components/ClaimDialog.jsx";
import { TANK_LABEL, timeAgo } from "../lib/format.js";

function GreenhouseList({ devices, emptyMessage }) {
  if (devices.length === 0) {
    return (
      <div className="px-6 py-8 text-sm text-chalk-dim">{emptyMessage}</div>
    );
  }

  return (
    <ul className="divide-y divide-chalk-dim/10">
      {devices.map((d) => {
        const t = d.telemetry;
        const isOwner = d.permissions?.isOwner === true;
        const canControl = d.permissions?.canControl === true;

        return (
          <li key={d.deviceId}>
            <Link
              to={`/greenhouse/${d.deviceId}`}
              className="flex flex-wrap items-center gap-x-8 gap-y-4 px-6 py-5 transition-colors hover:bg-chalk-dim/5"
            >
              <div className="min-w-[12rem] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-2xl font-semibold">
                    {d.name}
                  </p>

                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                      isOwner
                        ? "bg-leaf/10 text-leaf"
                        : "bg-chalk-dim/10 text-chalk-dim"
                    }`}
                  >
                    {isOwner ? <ShieldCheck size={13} /> : <Eye size={13} />}
                    {isOwner ? "Owner" : "Viewer"}
                  </span>

                  {!isOwner && canControl && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-leaf/10 px-2.5 py-1 text-xs font-medium text-leaf">
                      <SlidersHorizontal size={13} />
                      Control enabled
                    </span>
                  )}
                </div>

                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-chalk-dim">
                  <span
                    className={`size-2 rounded-full ${
                      d.online ? "bg-leaf" : "bg-chalk-dim/40"
                    }`}
                  />

                  {d.online
                    ? "Connected"
                    : `Disconnected · Last active ${timeAgo(d.lastSeenAt)}`}

                  {d.location && <span>· {d.location}</span>}
                </p>
              </div>

              <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
                <div>
                  <dt className="text-chalk-dim">Air Temperature</dt>
                  <dd className="font-display text-2xl font-semibold">
                    {t?.temp != null && Number.isFinite(Number(t.temp))
                      ? `${Number(t.temp).toFixed(1)}°`
                      : "–"}
                  </dd>
                </div>

                <div>
                  <dt className="text-chalk-dim">Soil Moisture</dt>
                  <dd className="font-display text-2xl font-semibold">
                    {t?.soil != null && Number.isFinite(Number(t.soil))
                      ? `${t.soil}%`
                      : "–"}
                  </dd>
                </div>

                <div>
                  <dt className="text-chalk-dim">Water Tank</dt>
                  <dd className="font-display text-2xl font-semibold">
                    {t?.tank && TANK_LABEL[t.tank] ? TANK_LABEL[t.tank] : "–"}
                  </dd>
                </div>
              </dl>

              <ChevronRight size={20} className="shrink-0 text-chalk-dim" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function Home() {
  const { user } = useAuth();
  const { devices, loading } = useDevices();
  const [claiming, setClaiming] = useState(false);

  const myGreenhouses = devices.filter(
    (device) => device.permissions?.isOwner === true,
  );

  const sharedGreenhouses = devices.filter(
    (device) => device.permissions?.isOwner !== true,
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {/* Dashboard heading */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-chalk-dim">
            Welcome back, {user?.name?.split(" ")[0] || "there"}
          </p>

          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Greenhouse Dashboard
          </h1>

          <p className="mt-2 text-sm text-chalk-dim">
            Monitor your greenhouses and manage the ones shared with you.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setClaiming(true)}
        >
          <Plus size={18} />
          Add Greenhouse
        </button>
      </div>

      {loading ? (
        <p className="mt-16 text-center text-chalk-dim">
          Loading your greenhouses…
        </p>
      ) : devices.length === 0 ? (
        /* First-time setup */
        <section className="panel mt-10 grid items-center gap-8 p-8 lg:grid-cols-2 lg:p-12">
          <div>
            <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-leaf/10 text-leaf">
              <House size={25} />
            </div>

            <h2 className="font-display text-3xl font-semibold">
              Connect Your First Greenhouse
            </h2>

            <p className="mt-3 max-w-md text-chalk-dim">
              Set up your ESP32 device, connect to its setup network, and
              register your greenhouse using its Device ID and claim code. Once
              connected, you can monitor conditions and manage your greenhouse
              from this dashboard.
            </p>

            <button
              type="button"
              className="btn btn-primary mt-6"
              onClick={() => setClaiming(true)}
            >
              <Plus size={18} />
              Add Greenhouse
            </button>
          </div>

          <GreenhouseDiagram
            telemetry={{ tank: "idle", out: {} }}
            className="w-full"
          />
        </section>
      ) : (
        <div className="mt-8 space-y-10">
          {/* Summary cards */}
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="panel p-5">
              <div className="flex items-center gap-2 text-sm text-chalk-dim">
                <House size={17} />
                My Greenhouses
              </div>

              <p className="mt-3 font-display text-3xl font-semibold">
                {myGreenhouses.length}
              </p>

              <p className="mt-1 text-xs text-chalk-dim">Greenhouses you own</p>
            </div>

            <div className="panel p-5">
              <div className="flex items-center gap-2 text-sm text-chalk-dim">
                <Users size={17} />
                Shared With Me
              </div>

              <p className="mt-3 font-display text-3xl font-semibold">
                {sharedGreenhouses.length}
              </p>

              <p className="mt-1 text-xs text-chalk-dim">
                Greenhouses others shared with you
              </p>
            </div>

            <div className="panel p-5">
              <div className="flex items-center gap-2 text-sm text-chalk-dim">
                <ShieldCheck size={17} />
                Connected
              </div>

              <p className="mt-3 font-display text-3xl font-semibold">
                {devices.filter((device) => device.online).length}
              </p>

              <p className="mt-1 text-xs text-chalk-dim">
                Accessible greenhouses currently online
              </p>
            </div>
          </section>

          {/* Greenhouses owned by this user */}
          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-display text-2xl font-semibold">
                  <House size={22} className="text-leaf" />
                  My Greenhouses
                </h2>

                <p className="mt-1 text-sm text-chalk-dim">
                  Greenhouses you own and manage.
                </p>
              </div>

              <span className="text-sm text-chalk-dim">
                {myGreenhouses.length}{" "}
                {myGreenhouses.length === 1 ? "greenhouse" : "greenhouses"}
              </span>
            </div>

            <div className="panel overflow-hidden">
              <GreenhouseList
                devices={myGreenhouses}
                emptyMessage="You don't own a greenhouse yet. Add your first greenhouse whenever you're ready."
              />
            </div>
          </section>

          {/* Greenhouses shared with this user */}
          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-display text-2xl font-semibold">
                  <Users size={22} className="text-chalk-dim" />
                  Shared With Me
                </h2>

                <p className="mt-1 text-sm text-chalk-dim">
                  Greenhouses other owners have given you access to.
                </p>
              </div>

              <span className="text-sm text-chalk-dim">
                {sharedGreenhouses.length}{" "}
                {sharedGreenhouses.length === 1 ? "greenhouse" : "greenhouses"}
              </span>
            </div>

            <div className="panel overflow-hidden">
              <GreenhouseList
                devices={sharedGreenhouses}
                emptyMessage="No greenhouses have been shared with you yet. When an owner grants access to your registered account, their greenhouse will appear here."
              />
            </div>
          </section>
        </div>
      )}

      <ClaimDialog open={claiming} onClose={() => setClaiming(false)} />
    </div>
  );
}
