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

const canonicalStatus = (status) => {
  const map = {
    Created: 'NEW',
    SentToVendor: 'NEW',
    Accepted: 'PREPARING',
    Preparing: 'PREPARING',
    Ready: 'READY',
    Assigned: 'ASSIGNED',
    PickedUp: 'ASSIGNED',
    Delivered: 'COMPLETED',
  };
  return map[status] || status;
};

const internalFromCanonical = (status) => {
  const map = {
    PREPARING: 'Preparing',
    READY: 'Ready',
    ASSIGNED: 'Assigned',
    COMPLETED: 'Delivered',
  };
  return map[status] || status;
};

const Orders = () => {
  const { toast } = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [activeTab, setActiveTab] = useState(() => {
    return sessionStorage.getItem('vendorOrdersActiveTab') || 'ALL';
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
        '/vendor/orders?statuses=Created,SentToVendor,Accepted,Preparing,Ready,Assigned,Delivered'
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
    const optimisticStatus = internalFromCanonical(nextStatus);
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
      const data = await apiPatch(`/vendor/orders/${orderId}/status`, { status: nextStatus });
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
      NEW: 0,
      PREPARING: 0,
      READY: 0,
      ASSIGNED: 0,
      COMPLETED: 0,
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
    { key: 'NEW', label: 'New' },
    { key: 'PREPARING', label: 'Preparing' },
    { key: 'READY', label: 'Ready' },
    { key: 'ASSIGNED', label: 'Assigned' },
    { key: 'COMPLETED', label: 'Completed' },
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
                ? 'border-rova-red/40 bg-rova-red/10 text-rova-red'
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
                  ? 'border-rova-red/40 bg-rova-red/10 text-rova-red'
                  : 'border-white/10 text-slate-300 hover:border-white/20'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] ${
                  isActive
                    ? 'border-rova-red/30 bg-rova-red/20 text-rova-red'
                    : 'border-white/10 text-slate-400'
                }`}
              >
                {counts[tab.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="glass rounded-2xl p-6 space-y-4">
        {loading ? (
          <div className="text-sm text-slate-400">Loading orders...</div>
        ) : visibleOrders.length === 0 ? (
          <div className="text-sm text-slate-400">
            No orders in {tabItems.find((t) => t.key === activeTab)?.label || 'this'} right now.
          </div>
        ) : (
          visibleOrders.map((o) => {
            const canonical = canonicalStatus(o.status);
            const placedAt = o.created_at ? new Date(o.created_at) : null;
            const itemsSubtotal =
              o.subtotal_cents ??
              (o.items || []).reduce((sum, item) => sum + item.unit_price_cents * item.quantity, 0);
            const deliveryFee = o.delivery_fee_cents ?? null;
            const total = o.total_cents ?? (deliveryFee !== null ? itemsSubtotal + deliveryFee : itemsSubtotal);

            const itemsLabel = formatCurrencyGHS(itemsSubtotal, o.subtotal_ghs);
            const deliveryLabel = formatCurrencyGHS(deliveryFee, o.delivery_fee_ghs);
            const totalLabel = formatCurrencyGHS(total, o.total_ghs);
            const showBreakdown = itemsLabel && deliveryLabel && totalLabel;

            const canStartPreparing = canonical === 'NEW';
            const canMarkReady = canonical === 'PREPARING';
            const canComplete = canonical === 'READY' && !o.driver_id;
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
                  </div>
                  <StatusChip status={o.status} />
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
                    {canStartPreparing && (
                      <button
                        onClick={() => updateStatus(o, 'PREPARING')}
                        disabled={Boolean(isActionLoading)}
                        className="btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60"
                      >
                        {isActionLoading ? 'Updating...' : 'Start Preparing'}
                      </button>
                    )}
                    {canMarkReady && (
                      <button
                        onClick={() => updateStatus(o, 'READY')}
                        disabled={Boolean(isActionLoading)}
                        className="btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60"
                      >
                        {isActionLoading ? 'Updating...' : 'Mark Ready'}
                      </button>
                    )}
                    {canComplete && (
                      <button
                        onClick={() => updateStatus(o, 'COMPLETED')}
                        disabled={Boolean(isActionLoading)}
                        className="rounded-lg border border-rova-red/40 px-3 py-1.5 text-xs text-rova-red hover:border-rova-red disabled:opacity-60"
                      >
                        {isActionLoading ? 'Updating...' : 'Complete'}
                      </button>
                    )}
                    {(canonical === 'ASSIGNED' || (canonical === 'READY' && o.driver_id)) && (
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
          <div className="glass w-full max-w-2xl rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Order</div>
                <div className="text-xl font-semibold">Order #{selectedOrder.id}</div>
                <div className="mt-1 text-xs text-slate-400">
                  Placed: {formatTime(selectedOrder.created_at ? new Date(selectedOrder.created_at) : null)}
                </div>
              </div>
              <StatusChip status={selectedOrder.status} />
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
                  const canonical = canonicalStatus(selectedOrder.status);
                  const canStartPreparing = canonical === 'NEW';
                  const canMarkReady = canonical === 'PREPARING';
                  const canComplete = canonical === 'READY' && !selectedOrder.driver_id;
                  const isActionLoading = actionLoading[selectedOrder.id];

                  return (
                    <>
                      {canStartPreparing && (
                        <button
                          onClick={() => updateStatus(selectedOrder, 'PREPARING')}
                          disabled={Boolean(isActionLoading)}
                          className="btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60"
                        >
                          {isActionLoading ? 'Updating...' : 'Start Preparing'}
                        </button>
                      )}
                      {canMarkReady && (
                        <button
                          onClick={() => updateStatus(selectedOrder, 'READY')}
                          disabled={Boolean(isActionLoading)}
                          className="btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60"
                        >
                          {isActionLoading ? 'Updating...' : 'Mark Ready'}
                        </button>
                      )}
                      {canComplete && (
                        <button
                          onClick={() => updateStatus(selectedOrder, 'COMPLETED')}
                          disabled={Boolean(isActionLoading)}
                          className="rounded-lg border border-rova-red/40 px-3 py-1.5 text-xs text-rova-red hover:border-rova-red disabled:opacity-60"
                        >
                          {isActionLoading ? 'Updating...' : 'Complete'}
                        </button>
                      )}
                      {(canonical === 'ASSIGNED' || (canonical === 'READY' && selectedOrder.driver_id)) && (
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
