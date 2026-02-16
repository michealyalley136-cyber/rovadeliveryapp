import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useToast } from '../components/ToastProvider';

const Success = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const orderId = localStorage.getItem('lastOrderId');
  const token = localStorage.getItem('lastOrderToken');
  const trackingUrl = orderId && token ? `${window.location.origin}/order/${orderId}?token=${token}` : '';

  const copyLink = async () => {
    if (!trackingUrl) return;
    await navigator.clipboard?.writeText(trackingUrl);
    toast({ type: 'success', message: 'Tracking link copied.' });
  };

  if (!orderId || !token) {
    return (
      <div className="space-y-6">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">ROVA</div>
          <h1 className="text-2xl font-semibold">Order not found</h1>
          <p className="text-sm text-slate-400">We could not find a recent order to display.</p>
        </div>
        <div className="rova-card glass rounded-2xl p-6">
          <button
            onClick={() => navigate('/')}
            className="btn-primary rounded-lg px-4 py-2 text-sm"
          >
            Browse vendors
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">ROVA</div>
        <h1 className="text-2xl font-semibold">Order confirmed</h1>
        <p className="text-sm text-slate-400">Order #{orderId} has been placed.</p>
      </div>

      <div className="rova-card glass rounded-2xl p-6 space-y-4">
        <div className="text-sm font-semibold">Track your delivery</div>
        <div className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300">
          {trackingUrl}
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={copyLink} className="btn-primary rounded-lg px-4 py-2 text-sm">
            Copy tracking link
          </button>
          <Link to={`/order/${orderId}?token=${token}`} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-200">
            Track now
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Success;
