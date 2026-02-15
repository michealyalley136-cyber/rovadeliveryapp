import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { apiGet } from '../api/client';
import { StatusChip } from '../components/StatusChip';
import { useToast } from '../components/ToastProvider';

const STATUS_FLOW = ['NEW', 'PREPARING', 'READY', 'ASSIGNED', 'COMPLETED'];

const getTokenForOrder = (orderId, queryToken) => {
  if (queryToken) {
    localStorage.setItem(`orderToken:${orderId}`, queryToken);
    return queryToken;
  }
  return localStorage.getItem(`orderToken:${orderId}`) || '';
};

const parseQuery = (search) => {
  const params = new URLSearchParams(search);
  return { token: params.get('token') };
};

const formatTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const OrderTracking = () => {
  const { id } = useParams();
  const { search } = useLocation();
  const { toast } = useToast();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState('');
  const inFlightRef = useRef(false);
  const pollRef = useRef(null);

  const { token } = parseQuery(search);
  const orderToken = getTokenForOrder(id, token);

  const load = async () => {
    if (!orderToken) {
      setError('Missing tracking token. Use the full tracking link.');
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    try {
      const data = await apiGet(`/orders/${id}?token=${orderToken}`);
      setOrder(data);
      setLastUpdated(new Date());
      setError('');
    } catch (e) {
      setError(e.message);
      toast({ type: 'error', message: e.message, persist: true });
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  };

  useEffect(() => {
    load();
  }, [id, orderToken]);

  useEffect(() => {
    const startPolling = () => {
      if (pollRef.current) return;
      pollRef.current = setInterval(() => {
        if (document.visibilityState === 'visible') {
          load();
        }
      }, 12000);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        startPolling();
      } else if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [orderToken, id]);

  const statusTimeline = useMemo(() => {
    if (!order?.timeline) return STATUS_FLOW;
    const seen = new Set(order.timeline.map((t) => t.status));
    return STATUS_FLOW.filter((s) => seen.has(s) || s === order.status);
  }, [order]);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-xs text-slate-400 hover:text-white">
          ← Back to vendors
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Track your order</h1>
        <p className="text-sm text-slate-400">Order #{id}</p>
      </div>

      <div className="glass rounded-2xl p-6 space-y-4">
        {loading ? (
          <div className="text-sm text-slate-400">Loading order status...</div>
        ) : error ? (
          <div className="rounded-lg border border-rova-red/40 bg-rova-red/10 px-4 py-3 text-sm">
            {error}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs text-slate-400">Current status</div>
                <StatusChip status={order.status} />
              </div>
              <div className="text-xs text-slate-400">
                Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : '-'}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 p-4">
                <div className="text-xs text-slate-400">Vendor</div>
                <div className="mt-2 text-sm">{order.vendor?.name || '-'}</div>
                {order.vendor?.whatsapp_number && (
                  <div className="mt-1 text-xs text-slate-500">{order.vendor.whatsapp_number}</div>
                )}
              </div>
              <div className="rounded-xl border border-white/10 p-4">
                <div className="text-xs text-slate-400">Driver</div>
                <div className="mt-2 text-sm">
                  {order.driver ? order.driver.name : 'Not assigned yet'}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {order.driver?.phone || ''}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 p-4">
              <div className="text-xs text-slate-400">Timeline</div>
              <div className="mt-3 space-y-2 text-sm text-slate-300">
                {STATUS_FLOW.map((status) => {
                  const entry = order.timeline?.find((t) => t.status === status);
                  const isActive = order.status === status;
                  return (
                    <div key={status} className="flex items-center justify-between">
                      <span className={isActive ? 'text-white' : ''}>{status}</span>
                      <span className="text-xs text-slate-500">
                        {entry ? formatTime(entry.timestamp) : '-'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 p-4">
              <div className="text-xs text-slate-400">Items</div>
              <div className="mt-3 space-y-2 text-sm text-slate-300">
                {(order.items || []).map((item, idx) => (
                  <div key={`${item.name}-${idx}`} className="flex items-center justify-between">
                    <span>
                      {item.name} x{item.qty || item.quantity}
                    </span>
                    <span>
                      GHS {Number(item.unit_price || (item.unit_price_cents || 0) / 100).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 p-4">
              <div className="text-xs text-slate-400">Totals</div>
              <div className="mt-2 text-sm text-slate-300 space-y-1">
                <div className="flex items-center justify-between">
                  <span>Items subtotal</span>
                  <span>GHS {order.totals?.items_subtotal?.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Delivery fee</span>
                  <span>GHS {order.totals?.delivery_fee?.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-white">
                  <span>Total</span>
                  <span className="text-base font-semibold">GHS {order.totals?.total?.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OrderTracking;
