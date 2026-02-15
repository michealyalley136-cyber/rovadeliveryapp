import React from 'react';
import { useNavigate } from 'react-router-dom';

import { setAdminKey } from '../api/client';

export const Topbar = ({ title }) => {
  const navigate = useNavigate();

  const logout = () => {
    setAdminKey('');
    navigate('/login');
  };

  return (
    <div className="flex items-center justify-between border-b border-white/10 pb-4">
      <div>
        <div className="text-sm text-slate-400">Dashboard</div>
        <h1 className="text-2xl font-semibold">{title}</h1>
      </div>
      <button
        onClick={logout}
        className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 hover:border-white/20"
      >
        Log out
      </button>
    </div>
  );
};
