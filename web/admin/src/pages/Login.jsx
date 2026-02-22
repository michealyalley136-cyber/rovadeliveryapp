import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getAdminKey, setAdminKey, consumeAuthMessage } from '../api/client';
import { useToast } from '../components/ToastProvider';

const Login = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [key, setKey] = useState(getAdminKey());

  React.useEffect(() => {
    const message = consumeAuthMessage();
    if (message) {
      toast({ type: 'error', message });
    }
  }, [toast]);

  const submit = (e) => {
    e.preventDefault();
    if (!key.trim()) {
      toast({ type: 'error', message: 'Admin API key required.' });
      return;
    }
    setAdminKey(key.trim());
    toast({ type: 'success', message: 'Admin key saved.' });
    navigate('/orders');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="rova-card glass w-full max-w-md rounded-2xl p-8">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">ROVA</div>
          <h1 className="text-2xl font-semibold">Admin Login</h1>
          <p className="text-sm text-slate-400">Enter your Admin API key to continue.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs text-slate-400">Admin API Key</label>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white focus-ring"
              placeholder="dev-admin-key"
            />
          </div>
          <button className="btn-primary w-full rounded-lg px-4 py-2 text-sm">
            Enter Dashboard
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
