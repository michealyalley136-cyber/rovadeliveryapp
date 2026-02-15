import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { apiGet, apiPost, publicGet } from '../api/client';
import { StatusChip } from '../components/StatusChip';
import { Topbar } from '../components/Topbar';
import { useToast } from '../components/ToastProvider';

const OrderDetail = () => {
  const { id } = useParams();
  const toast = useToast();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGet(`/admin/orders/${id}`);
      setOrder(data);
    } catch (e) {
      toast({ type: 'error', message: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const act = async (path) => {
    try {
      await apiPost(path);
      toast({ type: 'success', message: 'Order updated.' });
      load();
    } catch (e) {
      toast({ type: 'error', message: e.message });
    }
  };

  const copyWhatsApp = async () => {
    try {
      const data = await publicGet(`/whatsapp/order/${id}/message`);
      await navigator.clipboard.writeText(data.message || '');
      toast({ type: 'success', message: 'WhatsApp message copied.' });
    } catch (e) {
      toast({ type: 'error', message: e.message });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Topbar title="Order detail" />
        <div className="glass rounded-2xl p-6 text-sm text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-6">
        <Topbar title="Order detail" />
        <div className="glass rounded-2xl p-6 text-sm text-slate-400">Order not found.</div>
      </div>
    );
  }

  const vendor = order.vendor || {};
  const driver = order.driver || {};

  return (
    <div className="space-y-6">
      <Topbar title={`Order #${order.id}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="glass rounded-2xl p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-400">Status</div>
              <StatusChip status={order.status} />
            </div>
            <div className="text-right">
              <div className="text-sm text-slate-400">Total</div>
              <div className="text-xl font-semibold">
                GHS {(order.total_cents / 100).toFixed(2)}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-sm text-slate-400">Items</div>
            <div className="mt-3 divide-y divide-white/5">
              {(order.items || []).map((item) => (
                <div key={item.menu_item_id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-sm font-semibold">{item.name}</div>
                    <div className="text-xs text-slate-400">x{item.quantity}</div>
                  </div>
                  <div className="text-sm text-slate-300">
                    GHS {(item.unit_price_cents * item.quantity / 100).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 p-4">
              <div className="text-xs text-slate-400">Subtotal</div>
              <div className="text-sm font-semibold">GHS {(order.subtotal_cents / 100).toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-white/10 p-4">
              <div className="text-xs text-slate-400">Delivery</div>
              <div className="text-sm font-semibold">GHS {(order.delivery_fee_cents / 100).toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-white/10 p-4">
              <div className="text-xs text-slate-400">Distance</div>
              <div className="text-sm font-semibold">{order.delivery_distance_km ?? 0} km</div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => act(`/admin/orders/${order.id}/set-preparing`)}
              className="rounded-lg border border-white/10 px-4 py-2 text-xs hover:border-white/20"
            >
              Set Preparing
            </button>
            <button
              onClick={() => act(`/admin/orders/${order.id}/set-ready`)}
              className="btn-primary rounded-lg px-4 py-2 text-xs"
            >
              Set Ready
            </button>
            <button
              onClick={() => act(`/admin/orders/${order.id}/cancel`)}
              className="rounded-lg border border-rova-red/50 px-4 py-2 text-xs text-rova-red hover:border-rova-red"
            >
              Cancel
            </button>
            <button
              onClick={() => act(`/admin/orders/${order.id}/reassign`)}
              className="rounded-lg border border-rova-red/40 px-4 py-2 text-xs text-rova-red hover:border-rova-red"
            >
              Reassign
            </button>
            {vendor.vendor_type === 'WHATSAPP' && (
              <button
                onClick={copyWhatsApp}
                className="rounded-lg border border-white/10 px-4 py-2 text-xs hover:border-white/20"
              >
                Copy WhatsApp message
              </button>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass rounded-2xl p-6">
            <div className="text-sm text-slate-400">Vendor</div>
            <div className="mt-2 text-base font-semibold">{vendor.name || 'Vendor'}</div>
            <div className="mt-2 text-xs text-slate-400">Type: {vendor.vendor_type || 'N/A'}</div>
            <div className="text-xs text-slate-400">WhatsApp: {vendor.whatsapp_number || '—'}</div>
            <div className="text-xs text-slate-400">Lat/Lng: {vendor.lat ?? '—'}, {vendor.lng ?? '—'}</div>
          </div>
          <div className="glass rounded-2xl p-6">
            <div className="text-sm text-slate-400">Driver</div>
            <div className="mt-2 text-base font-semibold">{driver.full_name || 'Unassigned'}</div>
            <div className="mt-2 text-xs text-slate-400">Phone: {driver.phone || '—'}</div>
            <div className="text-xs text-slate-400">Online: {driver.is_online ? 'Yes' : 'No'}</div>
            <div className="text-xs text-slate-400">
              Location: {driver.last_known_lat ?? '—'}, {driver.last_known_lng ?? '—'}
            </div>
          </div>
          <div className="glass rounded-2xl p-6">
            <div className="text-sm text-slate-400">Dropoff</div>
            <div className="mt-2 text-sm">{order.dropoff?.address_text || '—'}</div>
            <div className="text-xs text-slate-400">
              Lat/Lng: {order.dropoff?.lat ?? '—'}, {order.dropoff?.lng ?? '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderDetail;
