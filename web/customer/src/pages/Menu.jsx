import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { apiGet } from '../api/client';
import { useToast } from '../components/ToastProvider';

const CART_KEY_PREFIX = 'customerCart:';
const ACTIVE_VENDOR_KEY = 'customerActiveVendorId';

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

const setCart = (vendorId, items) => {
  localStorage.setItem(`${CART_KEY_PREFIX}${vendorId}`, JSON.stringify(items));
  localStorage.setItem(ACTIVE_VENDOR_KEY, String(vendorId));
};

const Menu = () => {
  const { id } = useParams();
  const vendorId = id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const [vendor, setVendor] = useState(null);
  const [menu, setMenu] = useState([]);
  const [cart, setCartState] = useState(() => getCart(vendorId));
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [vendorData, menuData] = await Promise.all([
        apiGet('/public/vendors'),
        apiGet(`/public/vendors/${vendorId}/menu`),
      ]);
      const match = (vendorData.vendors || []).find((v) => String(v.id) === String(vendorId));
      setVendor(match || { id: vendorId, name: `Vendor #${vendorId}` });
      setMenu(menuData.items || []);
    } catch (e) {
      toast({ type: 'error', message: e.message, persist: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [vendorId]);

  const addItem = (item) => {
    setCartState((prev) => {
      const next = [...prev];
      const idx = next.findIndex((i) => i.id === item.id);
      if (idx >= 0) {
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
      } else {
        next.push({
          id: item.id,
          name: item.name,
          unit_price: Number((item.price_cents || 0) / 100),
          qty: 1,
        });
      }
      setCart(vendorId, next);
      return next;
    });
  };

  const updateQty = (itemId, qty) => {
    const safeQty = Math.max(1, qty);
    setCartState((prev) => {
      const next = prev.map((i) => (i.id === itemId ? { ...i, qty: safeQty } : i));
      setCart(vendorId, next);
      return next;
    });
  };

  const removeItem = (itemId) => {
    setCartState((prev) => {
      const next = prev.filter((i) => i.id !== itemId);
      setCart(vendorId, next);
      return next;
    });
  };

  const totals = useMemo(() => {
    const subtotal = cart.reduce((sum, i) => sum + i.qty * i.unit_price, 0);
    return { subtotal };
  }, [cart]);

  const goToCheckout = () => {
    if (cart.length === 0) {
      toast({ type: 'error', message: 'Add at least one item to continue.' });
      return;
    }
    navigate('/checkout');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link to="/" className="text-xs text-slate-400 hover:text-white">
            ← Back to vendors
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{vendor?.name || 'Menu'}</h1>
          <p className="text-sm text-slate-400">Select items to build your order.</p>
        </div>
        <button onClick={goToCheckout} className="btn-primary rounded-lg px-4 py-2 text-sm">
          Go to checkout
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="rova-card glass rounded-2xl p-6 space-y-4">
          {loading ? (
            <div className="text-sm text-slate-400">Loading menu...</div>
          ) : menu.length === 0 ? (
            <div className="text-sm text-slate-400">No menu items available.</div>
          ) : (
            menu.map((item) => (
              <div key={item.id} className="rounded-xl border border-white/10 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold">{item.name}</div>
                    {item.description && (
                      <div className="text-xs text-slate-400">{item.description}</div>
                    )}
                  </div>
                  <div className="text-sm font-semibold">
                    GHS {(item.price_cents / 100).toFixed(2)}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <button
                    onClick={() => addItem(item)}
                    className="btn-primary rounded-lg px-3 py-1.5 text-xs"
                  >
                    Add to cart
                  </button>
                  {!item.is_available && (
                    <span className="text-xs text-slate-500">Unavailable</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="rova-card glass rounded-2xl p-6 space-y-4">
          <div className="text-sm font-semibold">Your cart</div>
          {cart.length === 0 ? (
            <div className="text-sm text-slate-400">No items yet.</div>
          ) : (
            <div className="space-y-3">
              {cart.map((item) => (
                <div key={item.id} className="rounded-lg border border-white/10 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">{item.name}</div>
                      <div className="text-xs text-slate-400">
                        GHS {item.unit_price.toFixed(2)}
                      </div>
                    </div>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      onClick={() => updateQty(item.id, item.qty - 1)}
                      className="rounded-lg border border-white/10 px-2 py-1 text-xs"
                    >
                      -
                    </button>
                    <span className="text-sm">{item.qty}</span>
                    <button
                      onClick={() => updateQty(item.id, item.qty + 1)}
                      className="rounded-lg border border-white/10 px-2 py-1 text-xs"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-lg border border-white/10 px-4 py-3 text-xs text-slate-300">
            <div className="flex items-center justify-between">
              <span>Items subtotal</span>
              <span>GHS {totals.subtotal.toFixed(2)}</span>
            </div>
          </div>
          <button onClick={goToCheckout} className="btn-primary w-full rounded-lg px-4 py-2 text-sm">
            Checkout
          </button>
        </div>
      </div>
    </div>
  );
};

export default Menu;
