import React, { useEffect, useMemo, useRef, useState } from 'react';

import { apiGet, apiPatch, apiPost } from '../api/client';
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
  return map[status] || status || 'UNKNOWN';
};

const Orders = () => {
  const { toast } = useToast();
  const [readyOrders, setReadyOrders] = useState([]);
  const [activeOrders, setActiveOrders] = useState([]);
  const [completedOrders, setCompletedOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeTab, setActiveTab] = useState(() => {
    return sessionStorage.getItem('driverOrdersActiveTab') || 'READY';
  });
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(() => {
    const stored = sessionStorage.getItem('driverOrdersAutoRefresh');
    return stored === null ? true : stored === 'true';
  });
  const [actionLoading, setActionLoading] = useState({});
  const autoRefreshRef = useRef(null);
  const inFlightRef = useRef(false);

  const load = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    try {
      const [ready, active] = await Promise.all([
        apiGet('/driver/orders/ready'),
        apiGet('/driver/orders/active'),
      ]);
      setReadyOrders(ready.orders || []);
      setActiveOrders(active.orders || []);
      setLastUpdated(new Date());
    } catch (e) {
      toast({ type: 'error', message: e.message, persist: true });
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    sessionStorage.setItem('driverOrdersActiveTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    sessionStorage.setItem('driverOrdersAutoRefresh', String(autoRefreshEnabled));
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
            load();
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

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdated) return 'Last updated: -';
    return `Last updated: ${formatClock(lastUpdated)}`;
  }, [lastUpdated]);

  const counts = useMemo(() => {
    return {
      READY: readyOrders.length,
      ACTIVE: activeOrders.length,
      COMPLETED: completedOrders.length,
      ALL: readyOrders.length + activeOrders.length + completedOrders.length,
    };
  }, [readyOrders, activeOrders, completedOrders]);

  const visibleOrders = useMemo(() => {
    if (activeTab === 'READY') return readyOrders;
    if (activeTab === 'ACTIVE') return activeOrders;
    if (activeTab === 'COMPLETED') return completedOrders;
    return [...readyOrders, ...activeOrders, ...completedOrders];
  }, [activeTab, readyOrders, activeOrders, completedOrders]);

  const claimOrder = async (order) => {
    const orderId = order.id;
    setActionLoading((prev) => ({ ...prev, [orderId]: 'CLAIM' }));
    try {
      const data = await apiPost(`/driver/orders/${orderId}/claim`, {});
      setReadyOrders((prev) => prev.filter((o) => o.id !== orderId));
      setActiveOrders((prev) => [data, ...prev.filter((o) => o.id !== orderId)]);
      setLastUpdated(new Date());
      toast({ type: 'success', message: `Order #${orderId} claimed` });
    } catch (e) {
      toast({ type: 'error', message: e.message, persist: true });
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    }
  };

  const completeOrder = async (order) => {
    const orderId = order.id;
    setActionLoading((prev) => ({ ...prev, [orderId]: 'COMPLETE' }));
    try {
      const data = await apiPatch(`/driver/orders/${orderId}/status`, { status: 'COMPLETED' });
      setActiveOrders((prev) => prev.filter((o) => o.id !== orderId));
      setCompletedOrders((prev) => [data, ...prev.filter((o) => o.id !== orderId)]);
      setLastUpdated(new Date());
      toast({ type: 'success', message: `Order #${orderId} completed` });
    } catch (e) {
      toast({ type: 'error', message: e.message, persist: true });
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    }
  };

  const tabItems = [
    { key: 'READY', label: 'Ready' },
    { key: 'ACTIVE', label: 'Active' },
    { key: 'COMPLETED', label: 'Completed' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm text-slate-400">Driver queue</div>
          <div className="text-2xl font-semibold">Dispatch orders</div>
          <div className="mt-2 text-xs text-slate-400">
            Showing {visibleOrders.length} of {counts.ALL} orders
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
            onClick={load}
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
        aria-label="Driver order filters"
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
            const placedAt = o.created_at ? new Date(o.created_at) : null;
            const totals = o.totals || {};
            const itemsSubtotal =
              totals.subtotal_cents ??
              (o.items || []).reduce((sum, item) => sum + item.unit_price_cents * item.quantity, 0);
            const deliveryFee = totals.delivery_fee_cents ?? null;
            const total = totals.total_cents ?? (deliveryFee !== null ? itemsSubtotal + deliveryFee : itemsSubtotal);

            const itemsLabel = formatCurrencyGHS(itemsSubtotal, totals.subtotal_ghs);
            const deliveryLabel = formatCurrencyGHS(deliveryFee, totals.delivery_fee_ghs);
            const totalLabel = formatCurrencyGHS(total, totals.total_ghs);
            const showBreakdown = itemsLabel && deliveryLabel && totalLabel;
            const canonical = canonicalStatus(o.status);
            const isReady = canonical === 'READY';
            const isActive = canonical === 'ASSIGNED';
            const isLoading = actionLoading[o.id];

            return (
              <div key={o.id} className="rounded-xl border border-white/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold">Order #{o.id}</div>
                    <div className="text-xs text-slate-400">{o.vendor_name || 'Pickup'}</div>
                    <div className="mt-2 text-xs text-slate-400">
                      Dropoff: {o.dropoff?.address_text || '-'}
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
                    {isReady && (
                      <button
                        onClick={() => claimOrder(o)}
                        disabled={Boolean(isLoading)}
                        className="btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60"
                      >
                        {isLoading ? 'Claiming...' : 'Claim'}
                      </button>
                    )}
                    {isActive && (
                      <button
                        onClick={() => completeOrder(o)}
                        disabled={Boolean(isLoading)}
                        className="rounded-lg border border-rova-red/40 px-3 py-1.5 text-xs text-rova-red hover:border-rova-red disabled:opacity-60"
                      >
                        {isLoading ? 'Completing...' : 'Complete'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Orders;
