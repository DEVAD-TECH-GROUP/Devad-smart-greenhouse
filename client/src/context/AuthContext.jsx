import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, refreshSession, setAccessToken, setAuthFailHandler } from '../lib/api.js';
import { closeSocket } from '../lib/socket.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  const clear = useCallback(() => {
    setAccessToken(null);
    closeSocket();
    setUser(null);
  }, []);

  useEffect(() => {
    setAuthFailHandler(clear);
    refreshSession()
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setBooting(false));
  }, [clear]);

  const startSession = (d) => {
    setAccessToken(d.accessToken);
    setUser(d.user);
  };

  const value = {
    user,
    booting,
    setUser,
    async login(email, password) {
      startSession(await api('/auth/login', { method: 'POST', body: { email, password }, auth: false }));
    },
    async register(name, email, password) {
      startSession(await api('/auth/register', { method: 'POST', body: { name, email, password }, auth: false }));
    },
    async logout() {
      try { await api('/auth/logout', { method: 'POST', auth: false }); } catch { /* ignore */ }
      clear();
    },
    startSession,
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
