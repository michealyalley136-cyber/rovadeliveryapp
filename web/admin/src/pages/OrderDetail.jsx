import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { apiGet, apiPost, apiPatch, publicGet } from '../api/client';
import { StatusChip } from '../components/StatusChip';
import { Topbar } from '../components/Topbar';
import { useToast } from '../components/ToastProvider';

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

const isAwaitingPayment = (method, status) => {
  const key = (method || '').toString().trim().toLowerCase();
  const payment = (status || '').toString().trim().toLowerCase();
  return (key === 'momo' || key === 'card') && payment !== 'paid';
};

const OrderDetail = () => {
  const { id } = useParams();
  const toast = useToast();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelReason, setCancelReason] = useState('');
  const [refundRequired, setRefundRequired] = useState(false);
  const [refundNote, setRefundNote] = useState('');
  const [internalNote, setInternalNote] = useState('');

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

  useEffect(() => {
    if (!order) return;
    setRefundRequired(Boolean(order.refund_required));
    setRefundNote(order.refund_note || '');
  }, [order?.id]);

  const act = async (path) => {
    try {
      await apiPost(path);
      toast({ type: 'success', message: 'Order updated.' });
      load();
    } catch (e) {
      toast({ type: 'error', message: e.message });
    }
  };

  const runAdminAction = async (action, payload = {}) => {
    if (!order) return;
    try {
      await apiPatch(`/admin/orders/${order.id}/actions`, { action, ...payload });
      toast({ type: 'success', message: 'Order updated.' });
      setInternalNote('');
      load();
    } catch (e) {
      toast({ type: 'error', message: e.message });
    }
  };

  const handleForceCancel = () => {
    if (!cancelReason.trim()) {
      toast({ type: 'error', message: 'Cancel reason is required.' });
      return;
    }
    runAdminAction('force_cancel', { reason: cancelReason.trim() });
  };

  const handleRefundFlag = () => {
    runAdminAction('mark_refund_required', {
      refund_required: refundRequired,
      note: refundNote.trim(),
    });
  };

  const handleAddNote = () => {
    if (!internalNote.trim()) {
      toast({ type: 'error', message: 'Internal note is required.' });
      return;
    }
    runAdminAction('add_internal_note', { note: internalNote.trim() });
  };

  const handleMarkPaid = () => {
    runAdminAction('set_payment_status', { payment_status: 'paid' });
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
        <div className="rova-card glass rounded-2xl p-6 text-sm text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-6">
        <Topbar title="Order detail" />
        <div className="rova-card glass rounded-2xl p-6 text-sm text-slate-400">Order not found.</div>
      </div>
    );
  }

  const vendor = order.vendor || {};
  const driver = order.driver || {};
  const awaitingPayment = isAwaitingPayment(order.payment_method, order.payment_status);

  return (
    <div className="space-y-6">
      <Topbar title={`Order #${order.id}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rova-card glass rounded-2xl p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-400">Status</div>
              <StatusChip status={order.status} />
              <div className="mt-2 text-xs text-slate-400">
                Payment: {formatPaymentMethod(order.payment_method)} â€¢ {formatPaymentStatus(order.payment_status)}
              </div>
              {awaitingPayment && (
                <div className="mt-1 text-xs text-amber-300">Awaiting payment</div>
              )}
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

          <div className="mt-6">
            <div className="text-sm text-slate-400">Timeline</div>
            <div className="mt-3 space-y-2">
              {order.timeline?.length ? (
                order.timeline.map((entry, idx) => (
                  <div key={`${entry.status}-${idx}`} className="flex items-center justify-between text-xs">
                    <div className="text-slate-200">
                      {entry.status.replace(/_/g, ' ')}
                      {entry.reason ? ` • ${entry.reason}` : ''}
                    </div>
                    <div className="text-slate-400">
                      {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '-'}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-400">No timeline entries yet.</div>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 p-4">
              <div className="text-sm text-slate-300">Admin actions</div>
              <div className="mt-3 space-y-4">
                <div className="space-y-2">
                  <div className="text-xs text-slate-400">Force cancel</div>
                  <input
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Reason for cancellation"
                    className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs focus-ring"
                  />
                  <button
                    onClick={handleForceCancel}
                    className="btn-primary rounded-lg px-3 py-2 text-xs"
                  >
                    Force Cancel
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="text-xs text-slate-400">Refund flag</div>
                  <label className="flex items-center gap-2 text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={refundRequired}
                      onChange={(e) => setRefundRequired(e.target.checked)}
                    />
                    Refund required
                  </label>
                  <input
                    value={refundNote}
                    onChange={(e) => setRefundNote(e.target.value)}
                    placeholder="Refund note (optional)"
                    className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs focus-ring"
                  />
                  <button
                    onClick={handleRefundFlag}
                    className="rounded-lg border border-white/10 px-3 py-2 text-xs hover:border-white/20"
                  >
                    Save refund flag
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="text-xs text-slate-400">Payment status</div>
                  <div className="text-xs text-slate-300">
                    {formatPaymentMethod(order.payment_method)} â€¢ {formatPaymentStatus(order.payment_status)}
                  </div>
                  {awaitingPayment && (
                    <button
                      onClick={handleMarkPaid}
                      className="rounded-lg border border-emerald-400/40 px-3 py-2 text-xs text-emerald-200 hover:border-emerald-400/70"
                    >
                      Mark as Paid
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="text-xs text-slate-400">Internal note</div>
                  <textarea
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                    placeholder="Add an internal note"
                    rows={3}
                    className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs focus-ring"
                  />
                  <button
                    onClick={handleAddNote}
                    className="rounded-lg border border-white/10 px-3 py-2 text-xs hover:border-white/20"
                  >
                    Add note
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 p-4">
              <div className="text-sm text-slate-300">Ops actions</div>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  onClick={() => act(`/admin/orders/${order.id}/set-preparing`)}
                  className="rounded-lg border border-white/10 px-4 py-2 text-xs hover:border-white/20"
                >
                  Set Preparing
                </button>
                <button
                  onClick={() => act(`/admin/orders/${order.id}/set-ready`)}
                  className="btn-secondary rounded-lg px-4 py-2 text-xs"
                >
                  Set Ready
                </button>
                <button
                  onClick={() => act(`/admin/orders/${order.id}/cancel`)}
                  className="btn-primary rounded-lg px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={() => act(`/admin/orders/${order.id}/reassign`)}
                  className="btn-primary rounded-lg px-4 py-2 text-xs"
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
          </div>
        </div>

        <div className="space-y-6">
          <div className="rova-card glass rounded-2xl p-6">
            <div className="text-sm text-slate-400">Customer</div>
            <div className="mt-2 text-base font-semibold">
              {order.customer?.name || 'Customer'}
            </div>
            <div className="text-xs text-slate-400">Phone: {order.customer?.phone || '-'}</div>
            <div className="text-xs text-slate-400">
              Refund required: {order.refund_required ? 'Yes' : 'No'}
            </div>
            {order.refund_note ? (
              <div className="text-xs text-slate-400">Refund note: {order.refund_note}</div>
            ) : null}
            {order.cancel_reason ? (
              <div className="text-xs text-slate-400">Cancel reason: {order.cancel_reason}</div>
            ) : null}
          </div>
          <div className="rova-card glass rounded-2xl p-6">
            <div className="text-sm text-slate-400">Vendor</div>
            <div className="mt-2 text-base font-semibold">{vendor.name || 'Vendor'}</div>
            <div className="mt-2 text-xs text-slate-400">Type: {vendor.vendor_type || 'N/A'}</div>
            <div className="text-xs text-slate-400">WhatsApp: {vendor.whatsapp_number || '-'}</div>
            <div className="text-xs text-slate-400">Lat/Lng: {vendor.lat ?? '-'}, {vendor.lng ?? '-'}</div>
          </div>
          <div className="rova-card glass rounded-2xl p-6">
            <div className="text-sm text-slate-400">Driver</div>
            <div className="mt-2 text-base font-semibold">{driver.full_name || 'Unassigned'}</div>
            <div className="mt-2 text-xs text-slate-400">Phone: {driver.phone || '-'}</div>
            <div className="text-xs text-slate-400">Online: {driver.is_online ? 'Yes' : 'No'}</div>
            <div className="text-xs text-slate-400">
              Location: {driver.last_known_lat ?? '-'}, {driver.last_known_lng ?? '-'}
            </div>
          </div>
          <div className="rova-card glass rounded-2xl p-6">
            <div className="text-sm text-slate-400">Dropoff</div>
            <div className="mt-2 text-sm">{order.dropoff?.address_text || '-'}</div>
            <div className="text-xs text-slate-400">
              Lat/Lng: {order.dropoff?.lat ?? '-'}, {order.dropoff?.lng ?? '-'}
            </div>
          </div>
          <div className="rova-card glass rounded-2xl p-6">
            <div className="text-sm text-slate-400">Internal notes</div>
            <div className="mt-3 space-y-2 text-xs">
              {order.internal_notes?.length ? (
                order.internal_notes.map((note, idx) => (
                  <div key={`${note.timestamp}-${idx}`} className="rounded-lg border border-white/10 p-3">
                    <div className="text-slate-200">{note.note}</div>
                    <div className="text-slate-500">
                      {note.timestamp ? new Date(note.timestamp).toLocaleString() : '-'}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-slate-400">No internal notes yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderDetail;
