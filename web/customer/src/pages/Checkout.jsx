import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { apiGet, apiPost } from '../api/client';
import { useToast } from '../components/ToastProvider';
import { computeFeeBreakdown } from '../utils/fees';

const CART_KEY_PREFIX = 'customerCart:';
const ACTIVE_VENDOR_KEY = 'customerActiveVendorId';
const LAST_ORDER_ID = 'lastOrderId';
const LAST_ORDER_TOKEN = 'lastOrderToken';
const PROMO_KEY_PREFIX = 'customerPromo:';

const getActiveVendorId = () => localStorage.getItem(ACTIVE_VENDOR_KEY) || '';

const getCart = (vendorId) => {
  const raw = localStorage.getItem(`${CART_KEY_PREFIX}${vendorId}`);
  if (!raw) return [];
  try {
    const items = JSON.parse(raw);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
};

const clearCart = (vendorId) => {
  localStorage.removeItem(`${CART_KEY_PREFIX}${vendorId}`);
};

const getPromoCode = (vendorId) => {
  if (!vendorId) return '';
  return localStorage.getItem(`${PROMO_KEY_PREFIX}${vendorId}`) || '';
};

const setPromoCode = (vendorId, code) => {
  if (!vendorId) return;
  if (!code) {
    localStorage.removeItem(`${PROMO_KEY_PREFIX}${vendorId}`);
    return;
  }
  localStorage.setItem(`${PROMO_KEY_PREFIX}${vendorId}`, code);
};

const Checkout = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const vendorId = getActiveVendorId();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [pricingConfig, setPricingConfig] = useState(null);
  const [vendor, setVendor] = useState(null);
  const [promoInput, setPromoInput] = useState(() => getPromoCode(vendorId));
  const [promoApplied, setPromoApplied] = useState(null);
  const [promoError, setPromoError] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');

  const cart = useMemo(() => getCart(vendorId), [vendorId]);
  const subtotal = cart.reduce((sum, item) => sum + item.qty * item.unit_price, 0);
  const fees = useMemo(
    () => computeFeeBreakdown({ subtotal, config: pricingConfig, vendor }),
    [subtotal, pricingConfig, vendor]
  );
  const subtotalCents = Math.round(subtotal * 100);
  const discountCents = promoApplied?.discount_cents || 0;
  const discountGhs = discountCents / 100;
  const totalWithDiscount = Math.max(fees.total - discountGhs, 0);

  useEffect(() => {
    const load = async () => {
      try {
        const [pricingData, vendorsData] = await Promise.all([
          apiGet('/pricing'),
          apiGet('/public/vendors'),
        ]);
        setPricingConfig(pricingData.config || null);
        const match = (vendorsData.vendors || []).find((v) => String(v.id) === String(vendorId));
        setVendor(match || null);
      } catch (e) {
        toast({ type: 'error', message: e.message, persist: true });
      }
    };
    if (vendorId) {
      load();
    }
  }, [vendorId]);

  const applyPromo = async (code, { silent = false } = {}) => {
    const trimmed = (code || '').trim().toUpperCase();
    if (!trimmed) {
      setPromoError('Enter a promo code.');
      return;
    }
    if (!vendorId) {
      setPromoError('Select a vendor first.');
      return;
    }
    if (!subtotalCents) {
      setPromoError('Add items to apply a promo code.');
      return;
    }
    setPromoLoading(true);
    setPromoError('');
    try {
      const data = await apiPost('/customer/apply-promo', {
        code: trimmed,
        vendor_id: Number(vendorId),
        subtotal_cents: subtotalCents,
      });
      setPromoApplied({
        code: data.promo_code || trimmed,
        discount_cents: data.discount_cents || 0,
      });
      setPromoInput(data.promo_code || trimmed);
      setPromoCode(vendorId, data.promo_code || trimmed);
      if (!silent) {
        toast({ type: 'success', message: 'Promo applied.' });
      }
    } catch (e) {
      setPromoApplied(null);
      setPromoError(e.message);
      if (!silent) toast({ type: 'error', message: e.message });
    } finally {
      setPromoLoading(false);
    }
  };

  const clearPromo = () => {
    setPromoApplied(null);
    setPromoInput('');
    setPromoError('');
    setPromoCode(vendorId, '');
  };

  useEffect(() => {
    if (!promoApplied?.code) return;
    applyPromo(promoApplied.code, { silent: true });
  }, [subtotalCents, vendorId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!vendorId) {
      toast({ type: 'error', message: 'Select a vendor before checkout.' });
      return;
    }
    if (!cart.length) {
      toast({ type: 'error', message: 'Cart is empty.' });
      return;
    }
    if (!name.trim() || !phone.trim() || !address.trim()) {
      toast({ type: 'error', message: 'Name, phone, and address are required.' });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        vendor_id: Number(vendorId),
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        dropoff_address: address.trim(),
        notes: notes.trim(),
        promo_code: promoApplied?.code || promoInput.trim() || undefined,
        payment_method: paymentMethod,
        items: cart.map((i) => ({
          name: i.name,
          qty: i.qty,
          unit_price: i.unit_price,
        })),
      };
      const data = await apiPost('/orders', payload);
      if (data.order_id && data.token) {
        localStorage.setItem(LAST_ORDER_ID, String(data.order_id));
        localStorage.setItem(LAST_ORDER_TOKEN, data.token);
        localStorage.setItem(`orderToken:${data.order_id}`, data.token);
        clearCart(vendorId);
        navigate('/success');
      } else {
        toast({ type: 'error', message: 'Order created but missing tracking token.', persist: true });
      }
    } catch (e) {
      toast({ type: 'error', message: e.message, persist: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link to="/" className="text-xs text-slate-400 hover:text-white">
            ← Back to vendors
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Checkout</h1>
          <p className="text-sm text-slate-400">Enter your delivery details.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <form onSubmit={submit} className="rova-card glass rounded-2xl p-6 space-y-4">
          <div className="grid gap-3">
            <label className="text-xs text-slate-400">
              Full name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
                placeholder="Ama Mensah"
              />
            </label>
            <label className="text-xs text-slate-400">
              Phone
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
                placeholder="0551234567"
              />
            </label>
            <label className="text-xs text-slate-400">
              Dropoff address
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
                placeholder="Airport Residential, Accra"
                rows={3}
              />
            </label>
            <label className="text-xs text-slate-400">
              Notes (optional)
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
                placeholder="Gate code, landmarks, etc."
                rows={2}
              />
            </label>
            <div className="rounded-lg border border-white/10 p-3 text-xs text-slate-300">
              <div className="text-xs text-slate-400">Payment method</div>
              <div className="mt-3 space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="payment_method"
                    value="cash"
                    checked={paymentMethod === 'cash'}
                    onChange={() => setPaymentMethod('cash')}
                  />
                  <span>Cash on delivery</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="payment_method"
                    value="momo"
                    checked={paymentMethod === 'momo'}
                    onChange={() => setPaymentMethod('momo')}
                  />
                  <span>Mobile Money (MoMo)</span>
                </label>
                <div className="text-xs text-slate-500">Card payments coming soon.</div>
              </div>
            </div>
          </div>

          <button disabled={loading} className="btn-primary w-full rounded-lg px-4 py-2 text-sm">
            {loading ? 'Placing order...' : 'Place order'}
          </button>
        </form>

        <div className="rova-card glass rounded-2xl p-6 space-y-4">
          <div className="text-sm font-semibold">Order summary</div>
          {cart.length === 0 ? (
            <div className="text-sm text-slate-400">No items in cart.</div>
          ) : (
            <div className="space-y-2 text-sm text-slate-300">
              {cart.map((item) => (
                <div key={item.id} className="flex items-center justify-between">
                  <span>
                    {item.name} x{item.qty}
                  </span>
                  <span>GHS {(item.qty * item.unit_price).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-lg border border-white/10 px-4 py-3 text-xs text-slate-300 space-y-2">
            <div className="text-xs text-slate-400">Promo code</div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={promoInput}
                onChange={(e) => {
                  setPromoInput(e.target.value);
                  if (promoError) setPromoError('');
                }}
                placeholder="WELCOME10"
                className="flex-1 rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
              />
              <button
                type="button"
                onClick={() => applyPromo(promoInput)}
                disabled={promoLoading}
                className="rounded-lg border border-white/10 px-3 py-2 text-xs hover:border-white/20 disabled:opacity-60"
              >
                {promoLoading ? 'Applying...' : 'Apply'}
              </button>
              {promoApplied && (
                <button
                  type="button"
                  onClick={clearPromo}
                  className="rounded-lg border border-white/10 px-3 py-2 text-xs hover:border-white/20"
                >
                  Clear
                </button>
              )}
            </div>
            {promoError && <div className="text-xs text-rose-300">{promoError}</div>}
            {promoApplied && (
              <div className="text-xs text-emerald-300">
                Applied {promoApplied.code} (-GHS {(promoApplied.discount_cents / 100).toFixed(2)})
              </div>
            )}
          </div>
          <div className="rounded-lg border border-white/10 px-4 py-3 text-xs text-slate-300">
            <div className="flex items-center justify-between">
              <span>Items subtotal</span>
              <span>GHS {fees.subtotal.toFixed(2)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span>Delivery fee</span>
              <span>GHS {fees.deliveryFee.toFixed(2)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span>Service fee</span>
              <span>GHS {fees.serviceFee.toFixed(2)}</span>
            </div>
            {discountCents > 0 && (
              <div className="mt-2 flex items-center justify-between text-emerald-300">
                <span>Discount</span>
                <span>-GHS {discountGhs.toFixed(2)}</span>
              </div>
            )}
            <div className="mt-2 flex items-center justify-between text-white">
              <span>Total</span>
              <span className="text-base font-semibold">GHS {totalWithDiscount.toFixed(2)}</span>
            </div>
          </div>
          <div className="text-xs text-slate-400">
            Your tracking link will be shown after placing the order.
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
