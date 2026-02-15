import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { apiPost } from '../api/client';
import { useToast } from '../components/ToastProvider';

const CART_KEY_PREFIX = 'customerCart:';
const ACTIVE_VENDOR_KEY = 'customerActiveVendorId';
const LAST_ORDER_ID = 'lastOrderId';
const LAST_ORDER_TOKEN = 'lastOrderToken';

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

const Checkout = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const vendorId = getActiveVendorId();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const cart = useMemo(() => getCart(vendorId), [vendorId]);
  const deliveryFee = 5.0;

  const subtotal = cart.reduce((sum, item) => sum + item.qty * item.unit_price, 0);
  const total = subtotal + deliveryFee;

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
        items: cart.map((i) => ({
          name: i.name,
          qty: i.qty,
          unit_price: i.unit_price,
        })),
        delivery_fee: deliveryFee,
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
        <form onSubmit={submit} className="glass rounded-2xl p-6 space-y-4">
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
          </div>

          <button disabled={loading} className="btn-primary w-full rounded-lg px-4 py-2 text-sm">
            {loading ? 'Placing order...' : 'Place order'}
          </button>
        </form>

        <div className="glass rounded-2xl p-6 space-y-4">
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
          <div className="rounded-lg border border-white/10 px-4 py-3 text-xs text-slate-300">
            <div className="flex items-center justify-between">
              <span>Items subtotal</span>
              <span>GHS {subtotal.toFixed(2)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span>Delivery fee</span>
              <span>GHS {deliveryFee.toFixed(2)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-white">
              <span>Total</span>
              <span className="text-base font-semibold">GHS {total.toFixed(2)}</span>
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
