import React, { useEffect, useState } from 'react';

import { apiGet, apiPost } from '../api/client';
import { Topbar } from '../components/Topbar';
import { useToast } from '../components/ToastProvider';

const Drivers = () => {
  const toast = useToast();
  const [drivers, setDrivers] = useState([]);

  const load = async () => {
    try {
      const data = await apiGet('/admin/drivers');
      setDrivers(data.drivers || []);
    } catch (e) {
      toast({ type: 'error', message: e.message });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const approve = async (id) => {
    try {
      await apiPost(`/admin/drivers/${id}/approve`);
      toast({ type: 'success', message: 'Driver approved.' });
      load();
    } catch (e) {
      toast({ type: 'error', message: e.message });
    }
  };

  return (
    <div className="space-y-6">
      <Topbar title="Drivers" />
      <div className="glass rounded-2xl p-6 space-y-4">
        {drivers.map((d) => (
          <div key={d.id} className="rounded-xl border border-white/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{d.full_name || d.email}</div>
                <div className="text-xs text-slate-400">
                  {d.approved ? 'Approved' : 'Pending'} • {d.is_online ? 'Online' : 'Offline'}
                </div>
                <div className="text-xs text-slate-400">
                  Location: {d.last_known_lat ?? '—'}, {d.last_known_lng ?? '—'}
                </div>
              </div>
              {!d.approved && (
                <button
                  onClick={() => approve(d.id)}
                  className="btn-primary rounded-lg px-3 py-1.5 text-xs"
                >
                  Approve
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Drivers;
