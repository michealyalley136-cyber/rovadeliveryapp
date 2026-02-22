import React, { useEffect, useMemo, useRef, useState } from 'react';

import { apiGet, apiPatch } from '../api/client';
import { StatusChip } from '../components/StatusChip';
import { useToast } from '../components/ToastProvider';

const formatCurrencyGHS = (cents, ghs) => {
  if (ghs !== null && ghs !== undefined && !Number.isNaN(Number(ghs))) {
    return Number(ghs).toFixed(2);
  }
  if (cents === null || cents === undefined || Number.isNaN(Number(cents))) return null;
  return (Number(cents) / 100).toFixed(2);
};

const timeAgo = (date) => {
  if (!date) return '-';
  const diff = Math.max(0, Date.now() - date.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

const formatTime = (date) => {
  if (!date) return '-';
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatClock = (date) => {
  if (!date) return '-';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

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

const normalizeStatus = (status) => {
  if (!status) return 'unknown';
  const key = status.toString().trim().toLowerCase().replace(/\s+/g, '_');
  const map = {
    created: 'placed',
    sent_to_vendor: 'placed',
    senttovendor: 'placed',
    new: 'placed',
    placed: 'placed',
    accepted: 'accepted',
    preparing: 'preparing',
    ready: 'ready',
    assigned: 'assigned',
    picked_up: 'picked_up',
    pickedup: 'picked_up',
    delivered: 'delivered',
    completed: 'delivered',
    declined: 'declined',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    needs_reassign: 'ready',
  };
  return map[key] || 'unknown';
};

const canonicalStatus = (status) => normalizeStatus(status).toUpperCase();

const Orders = () => {
  const { toast } = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [activeTab, setActiveTab] = useState(() => {
    const stored = sessionStorage.getItem('vendorOrdersActiveTab') || 'ALL';
    const legacy = { NEW: 'PLACED', COMPLETED: 'DELIVERED' };
    return legacy[stored] || stored;
  });
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(() => {
    const stored = sessionStorage.getItem('vendorOrdersAutoRefresh');
    return stored === null ? true : stored === 'true';
  });
  const [highlightedOrders, setHighlightedOrders] = useState({});
  const prevOrderIdsRef = useRef(new Set());
  const autoRefreshRef = useRef(null);
  const inFlightRef = useRef(false);

  const load = async (opts = { detectNew: true }) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    try {
      const data = await apiGet(
        '/vendor/orders?statuses=placed,accepted,preparing,ready,assigned,picked_up,delivered,declined,cancelled'
      );
      const nextOrders = data.orders || [];
      setOrders(nextOrders);
      setLastUpdated(new Date());
      if (opts.detectNew) {
        const prevIds = prevOrderIdsRef.current;
        const newOrders = nextOrders.filter((o) => !prevIds.has(o.id));
        prevOrderIdsRef.current = new Set(nextOrders.map((o) => o.id));
        if (newOrders.length > 0) {
          const message =
            newOrders.length === 1
              ? `New order received: Order #${newOrders[0].id}`
              : `${newOrders.length} new orders received`;
          toast({ type: 'success', message });
          const now = Date.now();
          setHighlightedOrders((prev) => {
            const next = { ...prev };
            newOrders.forEach((o) => {
              next[o.id] = now + 10000;
            });
            return next;
          });
          setTimeout(() => {
            setHighlightedOrders((prev) => {
              const next = { ...prev };
              newOrders.forEach((o) => {
                if (next[o.id] && next[o.id] <= Date.now()) {
                  delete next[o.id];
                }
              });
              return next;
            });
          }, 10050);
        }
      } else if (prevOrderIdsRef.current.size === 0) {
        prevOrderIdsRef.current = new Set(nextOrders.map((o) => o.id));
      }
    } catch (e) {
      toast({ type: 'error', message: e.message, persist: true });
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  };

  useEffect(() => {
    load({ detectNew: false });
  }, []);

  useEffect(() => {
    sessionStorage.setItem('vendorOrdersActiveTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    sessionStorage.setItem('vendorOrdersAutoRefresh', String(autoRefreshEnabled));
  }, [autoRefreshEnabled]);

  useEffect(() => {
    const maybeStart = () => {
      if (!autoRefreshEnabled || document.visibilityState !== 'visible') {
        if (autoRefreshRef.current) {
          clearInterval(autoRefreshRef.current);
          autoRefreshRef.current = null;
        }
        return;
      }
      if (!autoRefreshRef.current) {
        autoRefreshRef.current = setInterval(() => {
          if (document.visibilityState === 'visible') {
            load({ detectNew: true });
          }
        }, 20000);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        maybeStart();
      } else if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
        autoRefreshRef.current = null;
      }
    };

    maybeStart();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
        autoRefreshRef.current = null;
      }
    };
  }, [autoRefreshEnabled]);

  const updateStatus = async (order, nextStatus) => {
    const orderId = order.id;
    const awaitingPayment = isAwaitingPayment(order.payment_method, order.payment_status);
    if (
      awaitingPayment &&
      nextStatus !== 'declined' &&
      nextStatus !== 'cancelled'
    ) {
      toast({ type: 'error', message: 'Awaiting payment before continuing.' });
      return;
    }
    const optimisticStatus = nextStatus;
    const prevOrders = orders;
    const prevSelected = selectedOrder;
    setActionLoading((prev) => ({ ...prev, [orderId]: nextStatus }));

    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: optimisticStatus } : o))
    );
    if (selectedOrder?.id === orderId) {
      setSelectedOrder({ ...selectedOrder, status: optimisticStatus });
    }

    try {
      const data = await apiPatch(`/vendor/orders/${orderId}`, { status: nextStatus });
      setOrders((prev) => prev.map((o) => (o.id === orderId ? data : o)));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(data);
      }
      setLastUpdated(new Date());
    } catch (e) {
      setOrders(prevOrders);
      setSelectedOrder(prevSelected);
      toast({ type: 'error', message: e.message, persist: true });
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    }
  };

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdated) return 'Last updated: -';
    return `Last updated: ${formatClock(lastUpdated)}`;
  }, [lastUpdated]);

  const counts = useMemo(() => {
    const base = {
      ALL: orders.length,
      PLACED: 0,
      ACCEPTED: 0,
      PREPARING: 0,
      READY: 0,
      ASSIGNED: 0,
      PICKED_UP: 0,
      DELIVERED: 0,
      DECLINED: 0,
      CANCELLED: 0,
    };
    orders.forEach((o) => {
      const canonical = canonicalStatus(o.status);
      if (base[canonical] !== undefined) {
        base[canonical] += 1;
      }
    });
    return base;
  }, [orders]);

  const visibleOrders = useMemo(() => {
    if (activeTab === 'ALL') return orders;
    return orders.filter((o) => canonicalStatus(o.status) === activeTab);
  }, [orders, activeTab]);

  const tabItems = [
    { key: 'ALL', label: 'All' },
    { key: 'PLACED', label: 'Placed' },
    { key: 'ACCEPTED', label: 'Accepted' },
    { key: 'PREPARING', label: 'Preparing' },
    { key: 'READY', label: 'Ready' },
    { key: 'ASSIGNED', label: 'Assigned' },
    { key: 'PICKED_UP', label: 'Picked up' },
    { key: 'DELIVERED', label: 'Delivered' },
    { key: 'DECLINED', label: 'Declined' },
    { key: 'CANCELLED', label: 'Cancelled' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm text-slate-400">Orders queue</div>
          <div className="text-2xl font-semibold">Active orders</div>
          <div className="mt-2 text-xs text-slate-400">
            Showing {visibleOrders.length} of {orders.length} orders
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span>{lastUpdatedLabel}</span>
          <button
            onClick={() => setAutoRefreshEnabled((prev) => !prev)}
            className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] transition ${
              autoRefreshEnabled
                ? 'accent-pill'
                : 'border-white/10 text-slate-400 hover:border-white/20'
            }`}
          >
            Auto-refresh {autoRefreshEnabled ? 'On' : 'Off'}
          </button>
          <button
            onClick={() => load({ detectNew: true })}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 hover:border-white/20 disabled:opacity-60"
          >
            {loading && (
              <span className="inline-block h-3 w-3 animate-spin rounded-full border border-white/40 border-t-transparent" />
            )}
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div
        className="flex gap-2 overflow-x-auto pb-2 text-xs text-slate-300"
        role="tablist"
        aria-label="Order status filters"
      >
        {tabItems.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 transition ${
                isActive
                  ? 'accent-pill'
                  : 'border-white/10 text-slate-300 hover:border-white/20'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] ${
                  isActive
                    ? 'accent-pill'
                    : 'border-white/10 text-slate-400'
                }`}
              >
                {counts[tab.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rova-card glass rounded-2xl p-6 space-y-4">
        {loading ? (
          <div className="text-sm text-slate-400">Loading orders...</div>
        ) : visibleOrders.length === 0 ? (
          <div className="text-sm text-slate-400">
            No orders in {tabItems.find((t) => t.key === activeTab)?.label || 'this'} right now.
          </div>
        ) : (
          visibleOrders.map((o) => {
            const normalized = normalizeStatus(o.status);
            const placedAt = o.created_at ? new Date(o.created_at) : null;
            const itemsSubtotal =
              o.subtotal_cents ??
              (o.items || []).reduce((sum, item) => sum + item.unit_price_cents * item.quantity, 0);
            const deliveryFee = o.delivery_fee_cents ?? null;
            const total = o.total_cents ?? (deliveryFee !== null ? itemsSubtotal + deliveryFee : itemsSubtotal);
            const awaitingPayment = isAwaitingPayment(o.payment_method, o.payment_status);

            const itemsLabel = formatCurrencyGHS(itemsSubtotal, o.subtotal_ghs);
            const deliveryLabel = formatCurrencyGHS(deliveryFee, o.delivery_fee_ghs);
            const totalLabel = formatCurrencyGHS(total, o.total_ghs);
            const showBreakdown = itemsLabel && deliveryLabel && totalLabel;

            const canAccept = normalized === 'placed' && !awaitingPayment;
            const canDecline = normalized === 'placed';
            const canStartPreparing = normalized === 'accepted' && !awaitingPayment;
            const canMarkReady = normalized === 'preparing' && !awaitingPayment;
            const canMarkPickedUp = normalized === 'ready' && !awaitingPayment;
            const canMarkDelivered = normalized === 'picked_up' && !awaitingPayment;
            const isActionLoading = actionLoading[o.id];

            return (
              <div
                key={o.id}
                className={`rounded-xl border border-white/5 p-4 ${
                  highlightedOrders[o.id] ? 'order-card-new' : ''
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold">Order #{o.id}</div>
                    <div className="text-xs text-slate-400">
                      {o.dropoff?.address_text || 'Dropoff'}
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      Placed: {timeAgo(placedAt)} | {formatTime(placedAt)}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      Payment: {formatPaymentMethod(o.payment_method)} â€¢ {formatPaymentStatus(o.payment_status)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusChip status={o.status} />
                    {awaitingPayment && (
                      <span className="rounded-full border border-amber-400/40 px-2 py-0.5 text-[10px] text-amber-200">
                        Awaiting Payment
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="space-y-2 text-xs text-slate-300">
                    {(o.items || []).map((item) => (
                      <div key={item.menu_item_id} className="flex items-center justify-between">
                        <span>
                          {item.name} x{item.quantity}
                        </span>
                        <span>GHS {formatCurrencyGHS(item.unit_price_cents * item.quantity)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg border border-white/10 p-3 text-xs text-slate-300">
                    {showBreakdown ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Items</span>
                          <span>GHS {itemsLabel}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Delivery</span>
                          <span>GHS {deliveryLabel}</span>
                        </div>
                        <div className="flex items-center justify-between text-white">
                          <span>Total</span>
                          <span className="text-base font-semibold">GHS {totalLabel}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-white">
                        <span>Total</span>
                        <span className="text-base font-semibold">GHS {totalLabel || '-'}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    {canAccept && (
                      <button
                        onClick={() => updateStatus(o, 'accepted')}
                        disabled={Boolean(isActionLoading)}
                        className="btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60"
                      >
                        {isActionLoading ? 'Updating...' : 'Accept'}
                      </button>
                    )}
                    {canDecline && (
                      <button
                        onClick={() => updateStatus(o, 'declined')}
                        disabled={Boolean(isActionLoading)}
                        className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-200 hover:border-red-500/70 disabled:opacity-60"
                      >
                        {isActionLoading ? 'Updating...' : 'Decline'}
                      </button>
                    )}
                    {canStartPreparing && (
                      <button
                        onClick={() => updateStatus(o, 'preparing')}
                        disabled={Boolean(isActionLoading)}
                        className="btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60"
                      >
                        {isActionLoading ? 'Updating...' : 'Start Preparing'}
                      </button>
                    )}
                    {canMarkReady && (
                      <button
                        onClick={() => updateStatus(o, 'ready')}
                        disabled={Boolean(isActionLoading)}
                        className="btn-secondary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60"
                      >
                        {isActionLoading ? 'Updating...' : 'Mark Ready'}
                      </button>
                    )}
                    {canMarkPickedUp && (
                      <button
                        onClick={() => updateStatus(o, 'picked_up')}
                        disabled={Boolean(isActionLoading)}
                        className="btn-secondary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60"
                      >
                        {isActionLoading ? 'Updating...' : 'Picked Up'}
                      </button>
                    )}
                    {canMarkDelivered && (
                      <button
                        onClick={() => updateStatus(o, 'delivered')}
                        disabled={Boolean(isActionLoading)}
                        className="btn-secondary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60"
                      >
                        {isActionLoading ? 'Updating...' : 'Delivered'}
                      </button>
                    )}
                    {normalized === 'assigned' && (
                      <span className="text-xs text-slate-300">Driver assigned</span>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedOrder(o)}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:border-white/20"
                  >
                    View details
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="rova-card glass w-full max-w-2xl rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Order</div>
                <div className="text-xl font-semibold">Order #{selectedOrder.id}</div>
                <div className="mt-1 text-xs text-slate-400">
                  Placed: {formatTime(selectedOrder.created_at ? new Date(selectedOrder.created_at) : null)}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Payment: {formatPaymentMethod(selectedOrder.payment_method)} â€¢ {formatPaymentStatus(selectedOrder.payment_status)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusChip status={selectedOrder.status} />
                {isAwaitingPayment(selectedOrder.payment_method, selectedOrder.payment_status) && (
                  <span className="rounded-full border border-amber-400/40 px-2 py-0.5 text-[10px] text-amber-200">
                    Awaiting Payment
                  </span>
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 p-4">
                <div className="text-xs text-slate-400">Dropoff</div>
                <div className="mt-2 text-sm">
                  {selectedOrder.dropoff?.address_text || '-'}
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  {selectedOrder.dropoff?.lat ?? '-'}, {selectedOrder.dropoff?.lng ?? '-'}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 p-4">
                <div className="text-xs text-slate-400">Driver</div>
                <div className="mt-2 text-sm">
                  {selectedOrder.driver_id ? `Driver #${selectedOrder.driver_id}` : 'Unassigned'}
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  Status: {selectedOrder.status}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-white/10 p-4">
              <div className="text-xs text-slate-400">Items</div>
              <div className="mt-3 space-y-2 text-sm">
                {(selectedOrder.items || []).map((item) => (
                  <div key={item.menu_item_id} className="flex items-center justify-between">
                    <span>
                      {item.name} x{item.quantity}
                    </span>
                    <span>
                      GHS {formatCurrencyGHS(item.unit_price_cents * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 p-4">
              <div className="text-xs text-slate-400">Notes</div>
              <div className="mt-2 text-sm text-slate-200">
                {selectedOrder.notes || 'No notes provided.'}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-2">
                {(() => {
                  const normalized = normalizeStatus(selectedOrder.status);
                  const awaitingPayment = isAwaitingPayment(
                    selectedOrder.payment_method,
                    selectedOrder.payment_status
                  );
                  const canAccept = normalized === 'placed' && !awaitingPayment;
                  const canDecline = normalized === 'placed';
                  const canStartPreparing = normalized === 'accepted' && !awaitingPayment;
                  const canMarkReady = normalized === 'preparing' && !awaitingPayment;
                  const canMarkPickedUp = normalized === 'ready' && !awaitingPayment;
                  const canMarkDelivered = normalized === 'picked_up' && !awaitingPayment;
                  const isActionLoading = actionLoading[selectedOrder.id];

                  return (
                    <>
                      {canAccept && (
                        <button
                          onClick={() => updateStatus(selectedOrder, 'accepted')}
                          disabled={Boolean(isActionLoading)}
                          className="btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60"
                        >
                          {isActionLoading ? 'Updating...' : 'Accept'}
                        </button>
                      )}
                      {canDecline && (
                        <button
                          onClick={() => updateStatus(selectedOrder, 'declined')}
                          disabled={Boolean(isActionLoading)}
                          className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-200 hover:border-red-500/70 disabled:opacity-60"
                        >
                          {isActionLoading ? 'Updating...' : 'Decline'}
                        </button>
                      )}
                      {canStartPreparing && (
                        <button
                          onClick={() => updateStatus(selectedOrder, 'preparing')}
                          disabled={Boolean(isActionLoading)}
                          className="btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60"
                        >
                          {isActionLoading ? 'Updating...' : 'Start Preparing'}
                        </button>
                      )}
                      {canMarkReady && (
                        <button
                          onClick={() => updateStatus(selectedOrder, 'ready')}
                          disabled={Boolean(isActionLoading)}
                          className="btn-secondary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60"
                        >
                          {isActionLoading ? 'Updating...' : 'Mark Ready'}
                        </button>
                      )}
                      {canMarkPickedUp && (
                        <button
                          onClick={() => updateStatus(selectedOrder, 'picked_up')}
                          disabled={Boolean(isActionLoading)}
                          className="btn-secondary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60"
                        >
                          {isActionLoading ? 'Updating...' : 'Picked Up'}
                        </button>
                      )}
                      {canMarkDelivered && (
                        <button
                          onClick={() => updateStatus(selectedOrder, 'delivered')}
                          disabled={Boolean(isActionLoading)}
                          className="btn-secondary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60"
                        >
                          {isActionLoading ? 'Updating...' : 'Delivered'}
                        </button>
                      )}
                      {normalized === 'assigned' && (
                        <span className="text-xs text-slate-300">Driver assigned</span>
                      )}
                    </>
                  );
                })()}
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:border-white/20"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;
