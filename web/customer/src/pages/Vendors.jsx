import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { apiGet } from '../api/client';
import { useToast } from '../components/ToastProvider';

const Vendors = () => {
  const { toast } = useToast();
  const [vendors, setVendors] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGet('/public/vendors');
      setVendors(data.vendors || []);
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
    if (!term) return vendors;
    return vendors.filter((v) => (v.name || '').toLowerCase().includes(term));
  }, [vendors, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">ROVA</div>
          <h1 className="text-2xl font-semibold">Pick a vendor</h1>
          <p className="text-sm text-slate-400">Choose a restaurant to start an order.</p>
        </div>
        <div className="w-full max-w-xs">
          <label className="text-xs text-slate-400">
            Search
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendors"
              className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm focus-ring"
            />
          </label>
        </div>
      </div>

      <div className="glass rounded-2xl p-6">
        {loading ? (
          <div className="text-sm text-slate-400">Loading vendors...</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-slate-400">No vendors found.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map((vendor) => (
              <div key={vendor.id} className="rounded-xl border border-white/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{vendor.name}</div>
                    <div className="text-xs text-slate-400">Vendor #{vendor.id}</div>
                    {vendor.whatsapp_number && (
                      <div className="text-xs text-slate-500">{vendor.whatsapp_number}</div>
                    )}
                  </div>
                  <Link
                    to={`/vendor/${vendor.id}`}
                    className="btn-primary rounded-lg px-3 py-1.5 text-xs"
                  >
                    View menu
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Vendors;
