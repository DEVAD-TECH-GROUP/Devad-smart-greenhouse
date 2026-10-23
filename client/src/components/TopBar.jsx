import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import Logo from './Logo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useDevices } from '../context/DevicesContext.jsx';

export default function TopBar() {
  const { user, logout } = useAuth();
  const { devices } = useDevices();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const initials = (user?.name || '?').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-chalk-dim/10 bg-fern-950/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link to="/" aria-label="Greenhouse home"><Logo /></Link>

        <nav className="ml-2 hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex" aria-label="Greenhouses">
          {devices.map((d) => (
            <NavLink
              key={d.deviceId}
              to={`/greenhouse/${d.deviceId}`}
              className={({ isActive }) => `inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${isActive ? 'bg-chalk-dim/15 text-chalk' : 'text-chalk-dim hover:text-chalk'}`}
            >
              <span className={`size-2 rounded-full ${d.online ? 'bg-leaf' : 'bg-chalk-dim/40'}`} />
              {d.name}
            </NavLink>
          ))}
        </nav>

        <div className="relative ml-auto" ref={ref}>
          <button className="btn btn-ghost !px-2.5 !py-1.5" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
            <span className="grid size-7 place-items-center rounded-full bg-leaf text-xs font-bold text-fern-950">{initials}</span>
            <span className="hidden text-sm sm:inline">{user?.name}</span>
            <ChevronDown size={16} />
          </button>
          {open && (
            <div role="menu" className="panel absolute right-0 mt-2 w-56 p-1.5 shadow-2xl">
              <p className="truncate px-3 py-2 text-xs text-chalk-dim">{user?.email}</p>
              <button role="menuitem" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-chalk-dim/10" onClick={() => { setOpen(false); nav('/account'); }}>
                <UserRound size={16} /> Account
              </button>
              <button role="menuitem" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-bloom hover:bg-bloom/10" onClick={logout}>
                <LogOut size={16} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
