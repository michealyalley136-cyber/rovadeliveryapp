import React, { useEffect, useState } from 'react';

import { apiGet, apiPatch } from '../api/client';
import { Topbar } from '../components/Topbar';
import { useToast } from '../components/ToastProvider';

const Pricing = () => {
  const toast = useToast();
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({
    base_km: '',
    base_fee_ghs: '',
    per_km_fee_ghs: '',
    service_fee_percent: '',
    minimum_service_fee_ghs: '',
  });

  const load = async () => {
    try {
      const data = await apiGet('/pricing', { admin: false });
      if (data.config) {
        setConfig(data.config);
        setForm({
          base_km: data.config.base_km,
          base_fee_ghs: data.config.base_fee_ghs,
          per_km_fee_ghs: data.config.per_km_fee_ghs,
          service_fee_percent: data.config.service_fee_percent ?? 0,
          minimum_service_fee_ghs: data.config.minimum_service_fee_ghs ?? 0,
        });
      }
    } catch (e) {
      toast({ type: 'error', message: e.message });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    try {
      const payload = {
        base_km: Number(form.base_km),
        base_fee_ghs: Number(form.base_fee_ghs),
        per_km_fee_ghs: Number(form.per_km_fee_ghs),
        service_fee_percent: Number(form.service_fee_percent),
        minimum_service_fee_ghs: Number(form.minimum_service_fee_ghs),
      };
      const data = await apiPatch('/admin/pricing', payload);
      setConfig(data);
      toast({ type: 'success', message: 'Pricing updated.' });
    } catch (e) {
      toast({ type: 'error', message: e.message });
    }
  };

  return (
    <div className="space-y-6">
      <Topbar title="Pricing" />
      <div className="rova-card glass rounded-2xl p-6 space-y-4 max-w-2xl">
        <div className="text-sm text-slate-400">Current config</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-slate-400">
            Base km
            <input
              value={form.base_km}
              onChange={(e) => setForm({ ...form, base_km: e.target.value })}
              className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
            />
          </label>
          <label className="text-xs text-slate-400">
            Base fee (GHS)
            <input
              value={form.base_fee_ghs}
              onChange={(e) => setForm({ ...form, base_fee_ghs: e.target.value })}
              className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
            />
          </label>
          <label className="text-xs text-slate-400">
            Per km fee (GHS)
            <input
              value={form.per_km_fee_ghs}
              onChange={(e) => setForm({ ...form, per_km_fee_ghs: e.target.value })}
              className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
            />
          </label>
          <label className="text-xs text-slate-400">
            Service fee (%)
            <input
              value={form.service_fee_percent}
              onChange={(e) => setForm({ ...form, service_fee_percent: e.target.value })}
              className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
            />
          </label>
          <label className="text-xs text-slate-400">
            Minimum service fee (GHS)
            <input
              value={form.minimum_service_fee_ghs}
              onChange={(e) => setForm({ ...form, minimum_service_fee_ghs: e.target.value })}
              className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
            />
          </label>
        </div>
        <button
          onClick={save}
          className="btn-primary rounded-lg px-4 py-2 text-sm"
        >
          Save pricing
        </button>
        {config && (
          <div className="text-xs text-slate-400">
            Updated: {config.updated_at || '—'}
          </div>
        )}
      </div>
    </div>
  );
};

export default Pricing;
