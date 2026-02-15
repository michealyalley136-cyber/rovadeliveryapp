import React, { createContext, useContext, useMemo, useState } from 'react';

const ToastContext = createContext(() => {});

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const pushToast = useMemo(
    () => (toast) => {
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
    <ToastContext.Provider value={pushToast}>
      {children}
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
