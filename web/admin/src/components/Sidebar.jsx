import React from 'react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/orders', label: 'Orders' },
  { to: '/vendors', label: 'Vendors' },
  { to: '/menu', label: 'Menu' },
  { to: '/drivers', label: 'Drivers' },
  { to: '/pricing', label: 'Pricing' },
];

export const Sidebar = () => {
  return (
    <aside className="rova-card glass h-full w-64 shrink-0 border-r border-white/10 px-4 py-6">
      <div className="mb-10">
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">ROVA</div>
        <div className="text-xl font-semibold">Admin Console</div>
      </div>
      <nav className="flex flex-col gap-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `rounded-lg px-3 py-2 text-sm transition ${
                isActive
                  ? 'accent-pill'
                  : 'text-slate-300 hover:bg-white/5'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};
