import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  apiPost,
  publicGet,
  getSelectedDriverId,
  setDriverSession,
  clearDriverState,
  getDriverListCache,
  setDriverListCache,
} from '../api/client';
import { useToast } from '../components/ToastProvider';

const PinEntry = () => {
  const navigate = useNavigate();
  const { toast, clearPersistentError } = useToast();
  const [driverId, setDriverId] = useState(getSelectedDriverId());
  const [driverName, setDriverName] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!driverId) {
      navigate('/driver/select', { replace: true });
    }
  }, [driverId, navigate]);

  useEffect(() => {
    const cached = getDriverListCache();
    const fromCache = cached.find((d) => String(d.id) === String(driverId));
    if (fromCache?.name) {
      setDriverName(fromCache.name);
      return;
    }
    const loadDriver = async () => {
      try {
        const data = await publicGet('/drivers');
        const drivers = data.drivers || [];
        setDriverListCache(drivers);
        const match = drivers.find((d) => String(d.id) === String(driverId));
        if (match?.name) {
          setDriverName(match.name);
        } else {
          setDriverName('');
          toast({
            type: 'error',
            message: 'Unable to load driver details. Please retry.',
            persist: true,
          });
        }
      } catch (e) {
        toast({
          type: 'error',
          message: 'Unable to load driver details. Please retry.',
          persist: true,
        });
      }
    };
    if (driverId) {
      loadDriver();
    }
  }, [driverId, toast]);

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
      const data = await apiPost(
        `/driver/auth/pin`,
        { driver_id: driverId, pin: trimmed },
        { auth: false }
      );
      const driver = data.driver || {};
      setDriverSession(data.token, driver.id || driverId, driver.name || driverName);
      clearPersistentError();
      navigate('/driver/dashboard');
    } catch (e) {
      const message = e.message === 'Invalid PIN' ? 'Incorrect PIN. Try again.' : e.message;
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const changeDriver = () => {
    clearDriverState();
    navigate('/driver/select');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="rova-card glass w-full max-w-md rounded-2xl p-8">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">ROVA</div>
          <h1 className="text-2xl font-semibold">Enter PIN</h1>
          <p className="text-sm text-slate-400">
            Entering PIN for: {driverName || `Driver #${driverId}`}
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
          onClick={changeDriver}
          className="mt-4 text-xs text-slate-400 hover:text-white"
        >
          Change driver
        </button>
      </div>
    </div>
  );
};

export default PinEntry;
