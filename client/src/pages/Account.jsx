import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PasswordInput from '../components/PasswordInput.jsx';

export default function Account() {
  const { user, setUser, startSession } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name || '');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwErrors, setPwErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const saveName = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await api('/auth/me', { method: 'PATCH', body: { name } });
      setUser(d.user);
      toast.ok('Name updated.');
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const changePw = async (e) => {
    e.preventDefault();
    setBusy(true);
    setPwErrors({});
    try {
      const d = await api('/auth/change-password', { method: 'POST', body: pw });
      startSession(d);
      setPw({ currentPassword: '', newPassword: '' });
      toast.ok('Password changed. Other devices have been signed out.');
    } catch (err) {
      setPwErrors(err.fields || {});
      toast.error(err.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-semibold tracking-tight">Account</h1>

      <form onSubmit={saveName} className="panel space-y-4 p-6">
        <h2 className="font-display text-2xl font-semibold">Profile</h2>
        <label className="block"><span className="text-sm font-medium">Name</span>
          <input className="field mt-1.5" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></label>
        <label className="block"><span className="text-sm font-medium">Email</span>
          <input className="field mt-1.5 opacity-70" value={user?.email || ''} disabled /></label>
        <button className="btn btn-primary" disabled={busy}>Save name</button>
      </form>

      <form onSubmit={changePw} className="panel space-y-4 p-6">
        <h2 className="font-display text-2xl font-semibold">Change password</h2>
        <label className="block"><span className="text-sm font-medium">Current password</span>
          <div className="mt-1.5"><PasswordInput autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required /></div></label>
        <label className="block"><span className="text-sm font-medium">New password</span>
          <div className="mt-1.5"><PasswordInput autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} invalid={!!pwErrors.newPassword} required /></div>
          <span className={`mt-1 block text-xs ${pwErrors.newPassword ? 'text-bloom' : 'text-chalk-dim'}`}>{pwErrors.newPassword?.[0] || 'At least 8 characters with a letter and a number.'}</span></label>
        <button className="btn btn-primary" disabled={busy}>Change password</button>
      </form>
    </div>
  );
}
