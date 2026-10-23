import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';

const Ctx = createContext(null);
export const useDevices = () => useContext(Ctx);

export function DevicesProvider({ children }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const d = await api('/devices');
    setDevices(d.devices);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh().catch(() => setLoading(false));

    const socket = getSocket();
    const onTelemetry = ({ deviceId, telemetry, online }) =>
      setDevices((list) => list.map((d) => (d.deviceId === deviceId ? { ...d, telemetry, online, lastSeenAt: telemetry?.ts ?? d.lastSeenAt } : d)));
    const onStatus = ({ deviceId, online }) =>
      setDevices((list) => list.map((d) => (d.deviceId === deviceId ? { ...d, online } : d)));
    const onReconnect = () => refresh().catch(() => {});

    socket.on('telemetry', onTelemetry);
    socket.on('device:status', onStatus);
    socket.on('connect', onReconnect);
    return () => {
      socket.off('telemetry', onTelemetry);
      socket.off('device:status', onStatus);
      socket.off('connect', onReconnect);
    };
  }, [refresh]);

  const add = useCallback((device) => {
    setDevices((l) => [...l, device]);
    getSocket().emit('subscribe', device.deviceId, () => {});
  }, []);
  const remove = useCallback((id) => setDevices((l) => l.filter((d) => d.deviceId !== id)), []);
  const patch = useCallback((id, p) => setDevices((l) => l.map((d) => (d.deviceId === id ? { ...d, ...p } : d))), []);

  return <Ctx.Provider value={{ devices, loading, refresh, add, remove, patch }}>{children}</Ctx.Provider>;
}
