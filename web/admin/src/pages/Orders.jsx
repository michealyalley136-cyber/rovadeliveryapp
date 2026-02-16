import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { apiGet } from '../api/client';
import { StatusChip } from '../components/StatusChip';
import { Topbar } from '../components/Topbar';
import { useToast } from '../components/ToastProvider';

const STATUSES = [
  'All',
  'Created',
  'Preparing',
  'Ready',
  'Assigned',
  'PickedUp',
  'Delivered',
  'Cancelled',
  'NEEDS_REASSIGN',
];

const Orders = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGet('/admin/orders');
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

  const filtered = useMemo(() => {
    if (statusFilter === 'All') return orders;
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

  return (
    <div className="space-y-6">
      <Topbar title="Orders" />
      <div className="rova-card glass rounded-2xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-400">Recent orders</div>
            <div className="text-lg font-semibold">{filtered.length} orders</div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s} className="bg-slate-900">
                  {s}
                </option>
              ))}
            </select>
            <button
              onClick={load}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 hover:border-white/20"
            >
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-slate-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-slate-400">No orders in this state.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map((o) => (
              <button
                key={o.id}
                onClick={() => navigate(`/orders/${o.id}`)}
                className="flex w-full items-center justify-between py-4 text-left hover:bg-white/5"
              >
                <div>
                  <div className="text-sm font-semibold">Order #{o.id}</div>
                  <div className="text-xs text-slate-400">Vendor #{o.vendor_id}</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-slate-300">
                    GHS {(o.total_cents / 100).toFixed(2)}
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
