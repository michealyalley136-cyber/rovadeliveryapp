import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { publicGet, setDriverListCache, setSelectedDriverId } from '../api/client';
import { useToast } from '../components/ToastProvider';

const SelectDriver = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [drivers, setDrivers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await publicGet('/drivers');
      setDrivers(data.drivers || []);
      setDriverListCache(data.drivers || []);
    } catch (e) {
      toast({ type: 'error', message: e.message, persist: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return drivers;
    return drivers.filter((d) => (d.name || '').toLowerCase().includes(term));
  }, [drivers, search]);

  const selectDriver = (driver) => {
    setSelectedDriverId(driver.id);
    navigate('/driver/pin');
  };

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">ROVA</div>
            <h1 className="text-2xl font-semibold">Select your driver</h1>
            <p className="text-sm text-slate-400">Choose your driver profile to begin.</p>
          </div>
          <div className="w-full max-w-xs">
            <label className="text-xs text-slate-400">
              Search
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search drivers"
                className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
              />
            </label>
          </div>
        </div>

        <div className="glass rounded-2xl p-6">
          {loading ? (
            <div className="text-sm text-slate-400">Loading drivers...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-slate-400">No drivers found.</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filtered.map((driver) => (
                <div key={driver.id} className="rounded-xl border border-white/10 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{driver.name}</div>
                      <div className="text-xs text-slate-400">Driver #{driver.id}</div>
                      <div className="text-xs text-slate-500">{driver.phone_masked || '-'}</div>
                    </div>
                    <button
                      onClick={() => selectDriver(driver)}
                      className="btn-primary rounded-lg px-3 py-1.5 text-xs"
                    >
                      Select
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SelectDriver;
