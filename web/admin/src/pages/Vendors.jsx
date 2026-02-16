import React, { useEffect, useState } from 'react';

import { apiGet, apiPost, apiPut } from '../api/client';
import { Topbar } from '../components/Topbar';
import { useToast } from '../components/ToastProvider';

const Vendors = () => {
  const toast = useToast();
  const [vendors, setVendors] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});

  const load = async () => {
    try {
      const data = await apiGet('/admin/vendors');
      setVendors(data.vendors || []);
    } catch (e) {
      toast({ type: 'error', message: e.message });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startEdit = (vendor) => {
    setEditingId(vendor.id);
    setForm({
      vendor_type: vendor.vendor_type || 'DASHBOARD',
      whatsapp_number: vendor.whatsapp_number || '',
      lat: vendor.lat ?? '',
      lng: vendor.lng ?? '',
      pin: '',
    });
  };

  const saveEdit = async (id) => {
    try {
      await apiPut(`/admin/vendors/${id}`, {
        vendor_type: form.vendor_type,
        whatsapp_number: form.whatsapp_number || null,
        lat: form.lat === '' ? null : Number(form.lat),
        lng: form.lng === '' ? null : Number(form.lng),
        ...(form.pin ? { pin: form.pin } : {}),
      });
      toast({ type: 'success', message: 'Vendor updated.' });
      setEditingId(null);
      setForm({});
      load();
    } catch (e) {
      toast({ type: 'error', message: e.message });
    }
  };

  const approve = async (id) => {
    try {
      await apiPost(`/admin/vendors/${id}/approve`);
      toast({ type: 'success', message: 'Vendor approved.' });
      load();
    } catch (e) {
      toast({ type: 'error', message: e.message });
    }
  };

  return (
    <div className="space-y-6">
      <Topbar title="Vendors" />
      <div className="rova-card glass rounded-2xl p-6 space-y-4">
        {vendors.map((v) => (
          <div key={v.id} className="rounded-xl border border-white/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{v.name}</div>
                <div className="text-xs text-slate-400">
                  {v.vendor_type} {v.approved ? '• Approved' : '• Pending'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!v.approved && (
                  <button
                    onClick={() => approve(v.id)}
                    className="btn-secondary rounded-lg px-3 py-1.5 text-xs"
                  >
                    Approve
                  </button>
                )}
                <button
                  onClick={() => startEdit(v)}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs"
                >
                  Edit
                </button>
              </div>
            </div>

            {editingId === v.id && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="text-xs text-slate-400">
                  Type
                  <select
                    value={form.vendor_type}
                    onChange={(e) => setForm({ ...form, vendor_type: e.target.value })}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
                  >
                    <option className="bg-slate-900" value="DASHBOARD">
                      DASHBOARD
                    </option>
                    <option className="bg-slate-900" value="WHATSAPP">
                      WHATSAPP
                    </option>
                  </select>
                </label>
                <label className="text-xs text-slate-400">
                  WhatsApp
                  <input
                    value={form.whatsapp_number}
                    onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
                  />
                </label>
                <label className="text-xs text-slate-400">
                  Latitude
                  <input
                    value={form.lat}
                    onChange={(e) => setForm({ ...form, lat: e.target.value })}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
                  />
                </label>
                <label className="text-xs text-slate-400">
                  Longitude
                  <input
                    value={form.lng}
                    onChange={(e) => setForm({ ...form, lng: e.target.value })}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
                  />
                </label>
                <label className="text-xs text-slate-400">
                  Set PIN (optional)
                  <input
                    value={form.pin}
                    onChange={(e) => setForm({ ...form, pin: e.target.value })}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
                    placeholder="1234"
                  />
                </label>
                <div className="flex items-end gap-2">
                  <button
                    onClick={() => saveEdit(v.id)}
                    className="btn-primary rounded-lg px-3 py-2 text-xs"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded-lg border border-white/10 px-3 py-2 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Vendors;
