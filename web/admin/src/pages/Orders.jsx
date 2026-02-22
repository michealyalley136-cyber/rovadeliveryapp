import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { apiGet } from '../api/client';
import { StatusChip } from '../components/StatusChip';
import { Topbar } from '../components/Topbar';
import { useToast } from '../components/ToastProvider';

const STATUSES = [
  { value: 'All', label: 'All' },
  { value: 'placed', label: 'Placed' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready', label: 'Ready' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'picked_up', label: 'Picked up' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'declined', label: 'Declined' },
  { value: 'cancelled', label: 'Cancelled' },
];

const formatPaymentMethod = (value) => {
  const key = (value || '').toString().trim().toLowerCase();
  if (key === 'momo') return 'MoMo';
  if (key === 'card') return 'Card';
  if (key === 'cash') return 'Cash';
  return value || '-';
};

const formatPaymentStatus = (value) => {
  const key = (value || '').toString().trim().toLowerCase();
  if (!key) return '-';
  return key.charAt(0).toUpperCase() + key.slice(1);
};

const Orders = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [statusFilter, setStatusFilter] = useState('All');
  const [vendorFilter, setVendorFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async (overrides = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const statusValue = overrides.statusFilter ?? statusFilter;
      const vendorValue = overrides.vendorFilter ?? vendorFilter;
      const fromValue = overrides.dateFrom ?? dateFrom;
      const toValue = overrides.dateTo ?? dateTo;
      const searchValue = overrides.search ?? search;
      if (statusValue && statusValue !== 'All') params.set('status', statusValue);
      if (vendorValue) params.set('vendor_id', vendorValue);
      if (fromValue) params.set('date_from', fromValue);
      if (toValue) params.set('date_to', toValue);
      if (searchValue.trim()) params.set('search', searchValue.trim());
      const path = `/admin/orders${params.toString() ? `?${params.toString()}` : ''}`;
      const data = await apiGet(path);
      setOrders(data.orders || []);
    } catch (e) {
      toast({ type: 'error', message: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const loadVendors = async () => {
    try {
      const data = await apiGet('/admin/vendors');
      setVendors(data.vendors || []);
    } catch (e) {
      toast({ type: 'error', message: e.message });
    }
  };

  useEffect(() => {
    loadVendors();
  }, []);

  const resetFilters = () => {
    setStatusFilter('All');
    setVendorFilter('');
    setDateFrom('');
    setDateTo('');
    setSearch('');
    load({
      statusFilter: 'All',
      vendorFilter: '',
      dateFrom: '',
      dateTo: '',
      search: '',
    });
  };

  return (
    <div className="space-y-6">
      <Topbar title="Orders" />
      <div className="rova-card glass rounded-2xl p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm text-slate-400">Recent orders</div>
            <div className="text-lg font-semibold">{orders.length} orders</div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order ID / customer"
              className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
            />
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
            >
              <option value="" className="bg-slate-900">
                All vendors
              </option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id} className="bg-slate-900">
                  {v.name}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value} className="bg-slate-900">
                  {s.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
            />
            <button
              onClick={load}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 hover:border-white/20"
            >
              Apply
            </button>
            <button
              onClick={resetFilters}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 hover:border-white/20"
            >
              Reset
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-slate-400">Loading...</div>
        ) : orders.length === 0 ? (
          <div className="text-sm text-slate-400">No orders in this state.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {orders.map((o) => (
              <button
                key={o.id}
                onClick={() => navigate(`/orders/${o.id}`)}
                className="flex w-full items-center justify-between py-4 text-left hover:bg-white/5"
              >
                <div>
                  <div className="text-sm font-semibold">Order #{o.id}</div>
                  <div className="text-xs text-slate-400">
                    Vendor: {o.vendor?.name || `#${o.vendor_id}`}
                  </div>
                  <div className="text-xs text-slate-400">
                    Customer: {o.customer?.name || 'Unknown'} {o.customer?.phone ? `• ${o.customer.phone}` : ''}
                  </div>
                  <div className="text-xs text-slate-400">
                    Payment: {formatPaymentMethod(o.payment_method)} â€¢ {formatPaymentStatus(o.payment_status)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {o.created_at ? new Date(o.created_at).toLocaleString() : '-'}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-slate-300">
                    GHS {((o.total_cents || 0) / 100).toFixed(2)}
                  </div>
                  <StatusChip status={o.status} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Orders;
