import React from 'react';

const STATUS_STYLES = {
  Created: 'bg-white/5 text-slate-200 border-white/10',
  SentToVendor: 'bg-white/5 text-slate-200 border-white/10',
  Accepted: 'bg-amber-900/40 text-amber-200 border-amber-500/40',
  Preparing: 'bg-amber-900/40 text-amber-200 border-amber-500/40',
  Ready: 'bg-slate-800/60 text-slate-100 border-white/10',
  Assigned: 'bg-slate-800/60 text-slate-100 border-white/10',
  PickedUp: 'bg-amber-900/30 text-amber-100 border-amber-500/30',
  Delivered: 'bg-white/5 text-slate-200 border-white/10',
  Cancelled: 'bg-rova-red/20 text-rova-red border-rova-red/40',
  NEEDS_REASSIGN: 'bg-rova-red/10 text-rova-red border-rova-red/40',
  NeedsReassign: 'bg-rova-red/10 text-rova-red border-rova-red/40',
};

export const StatusChip = ({ status }) => {
  const style = STATUS_STYLES[status] || 'bg-slate-800/70 text-slate-200 border-slate-600/40';
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${style}`}>
      {status}
    </span>
  );
};
