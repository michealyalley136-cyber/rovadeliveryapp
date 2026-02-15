import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import {
  clearVendorState,
  getVendorId,
  getVendorListCache,
  publicGet,
  setVendorListCache,
} from '../api/client';
import { useToast } from './ToastProvider';

export const Layout = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [vendorName, setVendorName] = useState('');
  const vendorId = getVendorId();

  useEffect(() => {
    const cached = getVendorListCache();
    const fromCache = cached.find((v) => String(v.id) === String(vendorId));
    if (fromCache?.name) {
      setVendorName(fromCache.name);
      return;
    }
    const loadVendor = async () => {
      try {
        const data = await publicGet('/vendors');
        const vendors = data.vendors || [];
        setVendorListCache(vendors);
        const match = vendors.find((v) => String(v.id) === String(vendorId));
        setVendorName(match?.name || '');
      } catch {
        toast({ type: 'error', message: 'Unable to load vendor details.', persist: true });
      }
    };
    if (vendorId) loadVendor();
  }, [vendorId, toast]);

  const logout = () => {
    clearVendorState();
    navigate('/vendor/select');
  };

  return (
    <div className="flex min-h-screen">
      <aside className="glass w-56 shrink-0 border-r border-white/10 px-4 py-6">
        <div className="mb-10">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">ROVA</div>
          <div className="mt-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rova-red/70" />
            <div className="text-lg font-semibold">{vendorName || 'Vendor'}</div>
          </div>
          <div className="text-xs text-slate-400">ID #{vendorId || '-'}</div>
        </div>
        <nav className="flex flex-col gap-2">
          <NavLink
            to="/vendor/dashboard"
            className={({ isActive }) =>
              `rounded-lg px-3 py-2 text-sm transition ${
                isActive
                  ? 'border border-rova-red/30 bg-rova-red/10 text-rova-red'
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
