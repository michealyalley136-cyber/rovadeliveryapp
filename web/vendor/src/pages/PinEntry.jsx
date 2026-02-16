import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  apiPost,
  publicGet,
  getSelectedVendorId,
  setVendorSession,
  clearVendorState,
  getVendorListCache,
  setVendorListCache,
} from '../api/client';
import { useToast } from '../components/ToastProvider';

const PinEntry = () => {
  const navigate = useNavigate();
  const { toast, clearPersistentError } = useToast();
  const [vendorId, setVendorId] = useState(getSelectedVendorId());
  const [vendorName, setVendorName] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!vendorId) {
      navigate('/vendor/select', { replace: true });
    }
  }, [vendorId, navigate]);

  useEffect(() => {
    const cached = getVendorListCache();
    const fromCache = cached.find((v) => String(v.id) === String(vendorId));
    if (fromCache?.name) {
      setVendorName(fromCache.name);
      return;
    }
    const loadVendor = async () => {
      try {
        const data = await publicGet('/vendors');
        const vendors = data.vendors || [];
        setVendorListCache(vendors);
        const match = vendors.find((v) => String(v.id) === String(vendorId));
        if (match?.name) {
          setVendorName(match.name);
        } else {
          setVendorName('');
          toast({
            type: 'error',
            message: 'Unable to load vendor details. Please retry.',
            persist: true,
          });
        }
      } catch (e) {
        toast({
          type: 'error',
          message: 'Unable to load vendor details. Please retry.',
          persist: true,
        });
      }
    };
    if (vendorId) {
      loadVendor();
    }
  }, [vendorId, toast]);

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = pin.trim();
    if (!/^\d{4,6}$/.test(trimmed)) {
      setError('PIN must be 4 to 6 digits.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await apiPost(`/vendors/${vendorId}/verify-pin`, { pin: trimmed }, { auth: false });
      setVendorSession(data.token, data.vendorId || vendorId);
      clearPersistentError();
      navigate('/vendor/dashboard');
    } catch (e) {
      const message = e.message === 'Invalid PIN' ? 'Incorrect PIN. Try again.' : e.message;
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const changeVendor = () => {
    clearVendorState();
    navigate('/vendor/select');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="rova-card glass w-full max-w-md rounded-2xl p-8">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">ROVA</div>
          <h1 className="text-2xl font-semibold">Enter PIN</h1>
          <p className="text-sm text-slate-400">
            Entering PIN for: {vendorName || `Vendor #${vendorId}`}
          </p>
        </div>

        {error && (
          <div className="alert-error mb-4 rounded-lg px-3 py-2 text-sm">
            {error}
            <div className="mt-2">
              <button
                type="button"
                onClick={() => {
                  setError('');
                  clearPersistentError();
                }}
                className="alert-error-btn rounded-lg px-3 py-1 text-xs"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <label className="text-xs text-slate-400">
            PIN
            <input
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                if (error) setError('');
                clearPersistentError();
              }}
              className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
              placeholder="1234"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
            />
          </label>
          <button disabled={loading} className="btn-primary w-full rounded-lg px-4 py-2 text-sm">
            {loading ? 'Verifying...' : 'Enter dashboard'}
          </button>
        </form>

        <button
          type="button"
          onClick={changeVendor}
          className="mt-4 text-xs text-slate-400 hover:text-white"
        >
          Change vendor
        </button>
      </div>
    </div>
  );
};

export default PinEntry;
