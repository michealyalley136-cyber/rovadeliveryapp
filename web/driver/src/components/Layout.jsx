import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import {
  clearDriverState,
  getDriverId,
  getDriverListCache,
  getDriverName,
  publicGet,
  setDriverListCache,
} from '../api/client';
import { useToast } from './ToastProvider';

export const Layout = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [driverName, setDriverName] = useState(getDriverName());
  const driverId = getDriverId();

  useEffect(() => {
    if (driverName) return;
    const cached = getDriverListCache();
    const fromCache = cached.find((d) => String(d.id) === String(driverId));
    if (fromCache?.name) {
      setDriverName(fromCache.name);
      return;
    }
    const loadDriver = async () => {
      try {
        const data = await publicGet('/drivers');
        const drivers = data.drivers || [];
        setDriverListCache(drivers);
        const match = drivers.find((d) => String(d.id) === String(driverId));
        setDriverName(match?.name || '');
      } catch (e) {
        toast({
          type: 'error',
          message: e.message || 'Unable to load driver details.',
          persist: true,
        });
      }
    };
    if (driverId) loadDriver();
  }, [driverId, driverName, toast]);

  const logout = () => {
    clearDriverState();
    navigate('/driver/select');
  };

  return (
    <div className="flex min-h-screen">
      <aside className="rova-card glass w-56 shrink-0 border-r border-white/10 px-4 py-6">
        <div className="mb-10">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">ROVA</div>
          <div className="mt-2 flex items-center gap-2">
            <span className="accent-dot h-2 w-2 rounded-full" />
            <div className="text-lg font-semibold">{driverName || 'Driver'}</div>
          </div>
          <div className="text-xs text-slate-400">ID #{driverId || '-'}</div>
        </div>
        <nav className="flex flex-col gap-2">
          <NavLink
            to="/driver/dashboard"
            className={({ isActive }) =>
              `rounded-lg px-3 py-2 text-sm transition ${
                isActive
                  ? 'accent-pill'
                  : 'text-slate-300 hover:bg-white/5'
              }`
            }
          >
            Orders
          </NavLink>
        </nav>
        <button
          onClick={logout}
          className="mt-8 w-full rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200"
        >
          Log out
        </button>
      </aside>
      <main className="flex-1 px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
};
