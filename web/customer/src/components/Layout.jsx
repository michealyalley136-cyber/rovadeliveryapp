import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

export const Layout = () => {
  const location = useLocation();
  const isActive = (path) => location.pathname === path;

  return (
    <div className="min-h-screen">
      <header className="rova-card glass border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">ROVA</div>
            <div className="text-lg font-semibold">Customer</div>
          </div>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              to="/"
              className={`rounded-lg px-3 py-2 transition ${
                isActive('/') ? 'accent-pill' : 'text-slate-300 hover:text-white'
              }`}
            >
              Vendors
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
};
