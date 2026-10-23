import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { DevicesProvider } from './context/DevicesContext.jsx';
import TopBar from './components/TopBar.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Home from './pages/Home.jsx';
import Device from './pages/Device.jsx';
import Account from './pages/Account.jsx';

function Splash() {
  return <div className="grid min-h-screen place-items-center text-chalk-dim"><span className="gh-pulse">Loading…</span></div>;
}

function Protected() {
  const { user, booting } = useAuth();
  const loc = useLocation();
  if (booting) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return (
    <DevicesProvider>
      <TopBar />
      <Outlet />
    </DevicesProvider>
  );
}

function GuestOnly() {
  const { user, booting } = useAuth();
  if (booting) return <Splash />;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>
      <Route element={<Protected />}>
        <Route path="/" element={<Home />} />
        <Route path="/greenhouse/:deviceId" element={<Device />} />
        <Route path="/account" element={<Account />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
