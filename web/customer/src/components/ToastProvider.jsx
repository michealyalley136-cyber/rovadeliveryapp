import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { setApiHandlers } from '../api/client';

const ToastContext = createContext({ toast: () => {}, clearPersistentError: () => {} });

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const [persistentError, setPersistentError] = useState('');

  useEffect(() => {
    setApiHandlers({
      onNetworkError: (message) => setPersistentError(message),
      onClear: () => setPersistentError(''),
    });
  }, []);

  const pushToast = useMemo(
    () => (toast) => {
      if (toast.persist) {
        setPersistentError(toast.message || 'Something went wrong.');
        return;
      }
      const id = Date.now() + Math.random();
      const payload = {
        id,
        type: toast.type || 'info',
        message: toast.message || '',
      };
      setToasts((prev) => [...prev, payload]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3200);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ toast: pushToast, clearPersistentError: () => setPersistentError('') }}>
      {children}
      {persistentError && (
        <div className="fixed left-1/2 top-6 z-50 w-[90vw] max-w-2xl -translate-x-1/2 rounded-xl border border-rova-red/50 bg-rova-red/10 px-4 py-3 text-sm text-white shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-rova-red">Error</div>
              <div className="mt-1 text-sm text-white">{persistentError}</div>
            </div>
            <button
              onClick={() => setPersistentError('')}
              className="rounded-lg border border-rova-red/40 px-3 py-1 text-xs text-rova-red hover:border-rova-red"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`glass rounded-lg px-4 py-3 text-sm shadow-lg border ${
              t.type === 'error'
                ? 'border-rova-red/60 text-rova-red'
                : t.type === 'success'
                ? 'border-rova-red/40 text-white'
                : 'border-white/10 text-slate-200'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
