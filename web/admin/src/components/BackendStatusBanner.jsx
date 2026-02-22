import React, { useEffect, useState } from 'react';

const CHECK_INTERVAL_MS = 15000;

const BackendStatusBanner = () => {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch('/health', { cache: 'no-store' });
        if (!res.ok) throw new Error('Health check failed');
        if (!cancelled) setOffline(false);
      } catch {
        if (!cancelled) setOffline(true);
      }
    };

    check();
    const timer = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed left-0 right-0 top-0 z-50 bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-black shadow-lg">
      Backend offline — trying to reconnect
    </div>
  );
};

export default BackendStatusBanner;
