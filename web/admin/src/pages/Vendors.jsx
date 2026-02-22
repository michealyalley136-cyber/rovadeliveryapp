import React, { useEffect, useMemo, useState } from 'react';

import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from '../api/client';
import { Topbar } from '../components/Topbar';
import { useToast } from '../components/ToastProvider';

const dayLabels = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

const blankHours = () =>
  dayLabels.reduce((acc, day) => {
    acc[day.key] = { open: '', close: '' };
    return acc;
  }, {});

const normalizeHours = (value) => {
  if (!value || typeof value !== 'object') return blankHours();
  const next = blankHours();
  dayLabels.forEach((day) => {
    if (value[day.key]) {
      next[day.key] = {
        open: value[day.key].open || '',
        close: value[day.key].close || '',
      };
    }
  });
  return next;
};

const Vendors = () => {
  const toast = useToast();
  const [vendors, setVendors] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({
    id: null,
    name: '',
    description: '',
    phone: '',
    hours: blankHours(),
    delivery_radius_km: '',
    minimum_order_amount: '',
    prep_time_minutes: '',
    base_delivery_fee_ghs: '',
    per_km_fee_ghs: '',
    service_fee_percent: '',
    minimum_service_fee_ghs: '',
    is_active: true,
    logo_url: '',
    banner_url: '',
    vendor_type: 'DASHBOARD',
    whatsapp_number: '',
    lat: '',
    lng: '',
    approved: true,
    pin: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState({ logo: false, banner: false });

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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return vendors.filter((v) => {
      const matchesTerm =
        !term ||
        v.name?.toLowerCase().includes(term) ||
        v.phone?.toLowerCase().includes(term);
      const matchesFilter =
        filter === 'all' ||
        (filter === 'active' && v.is_active) ||
        (filter === 'inactive' && !v.is_active);
      return matchesTerm && matchesFilter;
    });
  }, [vendors, search, filter]);

  const startCreate = () => {
    setForm({
      id: null,
      name: '',
      description: '',
      phone: '',
      hours: blankHours(),
      delivery_radius_km: '',
      minimum_order_amount: '',
      prep_time_minutes: '',
      base_delivery_fee_ghs: '',
      per_km_fee_ghs: '',
      service_fee_percent: '',
      minimum_service_fee_ghs: '',
      is_active: true,
      logo_url: '',
      banner_url: '',
      vendor_type: 'DASHBOARD',
      whatsapp_number: '',
      lat: '',
      lng: '',
      approved: true,
      pin: '',
    });
  };

  const startEdit = (vendor) => {
    setForm({
      id: vendor.id,
      name: vendor.name || '',
      description: vendor.description || '',
      phone: vendor.phone || '',
      hours: normalizeHours(vendor.hours),
      delivery_radius_km: vendor.delivery_radius_km ?? '',
      minimum_order_amount: vendor.minimum_order_amount ?? '',
      prep_time_minutes: vendor.prep_time_minutes ?? '',
      base_delivery_fee_ghs: vendor.base_delivery_fee_ghs ?? '',
      per_km_fee_ghs: vendor.per_km_fee_ghs ?? '',
      service_fee_percent: vendor.service_fee_percent ?? '',
      minimum_service_fee_ghs: vendor.minimum_service_fee_ghs ?? '',
      is_active: Boolean(vendor.is_active),
      logo_url: vendor.logo_url || '',
      banner_url: vendor.banner_url || '',
      vendor_type: vendor.vendor_type || 'DASHBOARD',
      whatsapp_number: vendor.whatsapp_number || '',
      lat: vendor.lat ?? '',
      lng: vendor.lng ?? '',
      approved: vendor.approved ?? false,
      pin: '',
    });
  };

  const serializeHours = () => {
    const hours = {};
    dayLabels.forEach((day) => {
      const entry = form.hours?.[day.key] || {};
      hours[day.key] = {
        open: entry.open || '',
        close: entry.close || '',
      };
    });
    return hours;
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ type: 'error', message: 'Name is required.' });
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description || null,
      phone: form.phone || null,
      hours: serializeHours(),
      delivery_radius_km: form.delivery_radius_km === '' ? null : Number(form.delivery_radius_km),
      minimum_order_amount: form.minimum_order_amount === '' ? null : Number(form.minimum_order_amount),
      prep_time_minutes: form.prep_time_minutes === '' ? null : Number(form.prep_time_minutes),
      base_delivery_fee_ghs: form.base_delivery_fee_ghs === '' ? null : Number(form.base_delivery_fee_ghs),
      per_km_fee_ghs: form.per_km_fee_ghs === '' ? null : Number(form.per_km_fee_ghs),
      service_fee_percent: form.service_fee_percent === '' ? null : Number(form.service_fee_percent),
      minimum_service_fee_ghs: form.minimum_service_fee_ghs === '' ? null : Number(form.minimum_service_fee_ghs),
      is_active: Boolean(form.is_active),
      logo_url: form.logo_url || null,
      banner_url: form.banner_url || null,
      vendor_type: form.vendor_type,
      whatsapp_number: form.whatsapp_number || null,
      lat: form.lat === '' ? null : Number(form.lat),
      lng: form.lng === '' ? null : Number(form.lng),
      approved: Boolean(form.approved),
      ...(form.pin ? { pin: form.pin } : {}),
    };

    try {
      if (form.id) {
        await apiPatch(`/admin/vendors/${form.id}`, payload);
        toast({ type: 'success', message: 'Vendor updated.' });
      } else {
        await apiPost('/admin/vendors', payload);
        toast({ type: 'success', message: 'Vendor created.' });
      }
      setForm((prev) => ({ ...prev, pin: '' }));
      load();
    } catch (e) {
      toast({ type: 'error', message: e.message });
    } finally {
      setSaving(false);
    }
  };

  const removeVendor = async () => {
    if (!form.id) return;
    if (!window.confirm('Deactivate this vendor?')) return;
    try {
      await apiDelete(`/admin/vendors/${form.id}`);
      toast({ type: 'success', message: 'Vendor deactivated.' });
      startCreate();
      load();
    } catch (e) {
      toast({ type: 'error', message: e.message });
    }
  };

  const handleUpload = async (file, type) => {
    if (!file) return;
    setUploading((prev) => ({ ...prev, [type]: true }));
    try {
      const data = await apiUpload('/admin/uploads', file);
      const url = data.url || '';
      setForm((prev) => ({ ...prev, [`${type}_url`]: url }));
      toast({ type: 'success', message: 'Upload complete.' });
    } catch (e) {
      toast({ type: 'error', message: e.message });
    } finally {
      setUploading((prev) => ({ ...prev, [type]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <Topbar title="Vendors" />
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="rova-card glass rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-400">Manage vendors</div>
            <button
              onClick={startCreate}
              className="btn-primary rounded-lg px-3 py-1.5 text-xs"
            >
              New vendor
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendors..."
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring sm:w-64"
            />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
            >
              <option className="bg-slate-900" value="all">All</option>
              <option className="bg-slate-900" value="active">Active</option>
              <option className="bg-slate-900" value="inactive">Inactive</option>
            </select>
          </div>
          <div className="divide-y divide-white/5">
            {filtered.map((v) => (
              <button
                key={v.id}
                onClick={() => startEdit(v)}
                className="flex w-full items-center justify-between py-3 text-left hover:bg-white/5"
              >
                <div>
                  <div className="text-sm font-semibold">{v.name}</div>
                  <div className="text-xs text-slate-400">
                    {v.phone || v.whatsapp_number || 'No phone'} •{' '}
                    {v.is_active ? 'Active' : 'Inactive'}
                  </div>
                </div>
                <div className="text-xs text-slate-400">#{v.id}</div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="py-6 text-sm text-slate-400">No vendors found.</div>
            )}
          </div>
        </div>

        <div className="rova-card glass rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm text-slate-400">
                {form.id ? `Editing #${form.id}` : 'Create new vendor'}
              </div>
              <div className="text-lg font-semibold">
                {form.id ? form.name || 'Vendor' : 'New vendor'}
              </div>
            </div>
            {form.id && (
              <button
                onClick={removeVendor}
                className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-200 hover:border-red-500/70"
              >
                Deactivate
              </button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-400">
              Name
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
              />
            </label>
            <label className="text-xs text-slate-400">
              Phone
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
              />
            </label>
          </div>

          <label className="text-xs text-slate-400">
            Description
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
              rows={3}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-slate-400">
              Delivery radius (km)
              <input
                type="number"
                value={form.delivery_radius_km}
                onChange={(e) => setForm({ ...form, delivery_radius_km: e.target.value })}
                className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
              />
            </label>
            <label className="text-xs text-slate-400">
              Minimum order (GHS)
              <input
                type="number"
                value={form.minimum_order_amount}
                onChange={(e) => setForm({ ...form, minimum_order_amount: e.target.value })}
                className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
              />
            </label>
            <label className="text-xs text-slate-400">
              Prep time (min)
              <input
                type="number"
                value={form.prep_time_minutes}
                onChange={(e) => setForm({ ...form, prep_time_minutes: e.target.value })}
                className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-400">
              Base delivery fee (GHS)
              <input
                type="number"
                value={form.base_delivery_fee_ghs}
                onChange={(e) => setForm({ ...form, base_delivery_fee_ghs: e.target.value })}
                className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
              />
            </label>
            <label className="text-xs text-slate-400">
              Per km fee (GHS)
              <input
                type="number"
                value={form.per_km_fee_ghs}
                onChange={(e) => setForm({ ...form, per_km_fee_ghs: e.target.value })}
                className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
              />
            </label>
            <label className="text-xs text-slate-400">
              Service fee (%)
              <input
                type="number"
                value={form.service_fee_percent}
                onChange={(e) => setForm({ ...form, service_fee_percent: e.target.value })}
                className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
              />
            </label>
            <label className="text-xs text-slate-400">
              Minimum service fee (GHS)
              <input
                type="number"
                value={form.minimum_service_fee_ghs}
                onChange={(e) => setForm({ ...form, minimum_service_fee_ghs: e.target.value })}
                className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-400">
              Vendor type
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
              WhatsApp number
              <input
                value={form.whatsapp_number}
                onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })}
                className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
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
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-400">
              Approved
              <select
                value={form.approved ? 'yes' : 'no'}
                onChange={(e) => setForm({ ...form, approved: e.target.value === 'yes' })}
                className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
              >
                <option className="bg-slate-900" value="yes">Yes</option>
                <option className="bg-slate-900" value="no">No</option>
              </select>
            </label>
            <label className="text-xs text-slate-400">
              Active
              <select
                value={form.is_active ? 'yes' : 'no'}
                onChange={(e) => setForm({ ...form, is_active: e.target.value === 'yes' })}
                className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
              >
                <option className="bg-slate-900" value="yes">Yes</option>
                <option className="bg-slate-900" value="no">No</option>
              </select>
            </label>
          </div>

          <label className="text-xs text-slate-400">
            Set PIN (optional)
            <input
              value={form.pin}
              onChange={(e) => setForm({ ...form, pin: e.target.value })}
              className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
              placeholder="1234"
            />
          </label>

          <div>
            <div className="text-xs text-slate-400">Hours</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {dayLabels.map((day) => (
                <div key={day.key} className="rounded-lg border border-white/10 p-3">
                  <div className="text-xs text-slate-300">{day.label}</div>
                  <div className="mt-2 flex gap-2">
                    <input
                      placeholder="Open"
                      value={form.hours?.[day.key]?.open || ''}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          hours: {
                            ...prev.hours,
                            [day.key]: {
                              ...(prev.hours?.[day.key] || {}),
                              open: e.target.value,
                            },
                          },
                        }))
                      }
                      className="w-full rounded-lg border border-white/10 bg-transparent px-2 py-1 text-xs focus-ring"
                    />
                    <input
                      placeholder="Close"
                      value={form.hours?.[day.key]?.close || ''}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          hours: {
                            ...prev.hours,
                            [day.key]: {
                              ...(prev.hours?.[day.key] || {}),
                              close: e.target.value,
                            },
                          },
                        }))
                      }
                      className="w-full rounded-lg border border-white/10 bg-transparent px-2 py-1 text-xs focus-ring"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 p-3">
              <div className="text-xs text-slate-400">Logo</div>
              {form.logo_url && (
                <img
                  src={form.logo_url}
                  alt="Logo"
                  className="mt-2 h-20 w-full rounded-lg object-cover"
                />
              )}
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleUpload(e.target.files?.[0], 'logo')}
                  className="text-xs text-slate-300"
                />
                {uploading.logo && (
                  <span className="text-xs text-slate-400">Uploading...</span>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 p-3">
              <div className="text-xs text-slate-400">Banner</div>
              {form.banner_url && (
                <img
                  src={form.banner_url}
                  alt="Banner"
                  className="mt-2 h-20 w-full rounded-lg object-cover"
                />
              )}
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleUpload(e.target.files?.[0], 'banner')}
                  className="text-xs text-slate-300"
                />
                {uploading.banner && (
                  <span className="text-xs text-slate-400">Uploading...</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="btn-primary rounded-lg px-4 py-2 text-xs disabled:opacity-60"
            >
              {saving ? 'Saving...' : form.id ? 'Save changes' : 'Create vendor'}
            </button>
            <button
              onClick={startCreate}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Vendors;
