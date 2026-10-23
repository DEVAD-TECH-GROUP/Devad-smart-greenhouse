import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setErrors({});
    try {
      await register(form.name, form.email, form.password);
      nav('/', { replace: true });
    } catch (err) {
      setErrors(err.fields || {});
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const fieldError = (k) => errors[k] && <span className="mt-1 block text-xs text-bloom">{errors[k][0]}</span>;

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Link your greenhouse in under two minutes."
      footer={<>Already have an account? <Link to="/login" className="font-semibold text-leaf hover:underline">Sign in</Link></>}
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && !Object.keys(errors).length && <p role="alert" className="rounded-xl bg-bloom/10 px-4 py-3 text-sm text-bloom">{error}</p>}
        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input className="field mt-1.5" autoComplete="name" value={form.name} onChange={set('name')} aria-invalid={!!errors.name} required autoFocus />
          {fieldError('name')}
        </label>
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input className="field mt-1.5" type="email" autoComplete="email" value={form.email} onChange={set('email')} aria-invalid={!!errors.email} required />
          {fieldError('email')}
        </label>
        <label className="block">
          <span className="text-sm font-medium">Password</span>
          <div className="mt-1.5">
            <PasswordInput autoComplete="new-password" value={form.password} onChange={set('password')} invalid={!!errors.password} required />
          </div>
          {fieldError('password') || <span className="mt-1 block text-xs text-chalk-dim">At least 8 characters with a letter and a number.</span>}
        </label>
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
    </AuthLayout>
  );
}
