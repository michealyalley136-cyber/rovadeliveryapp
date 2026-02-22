import React from 'react';

const normalizeStatus = (status) => {
  if (!status) return 'unknown';
  const key = status.toString().trim().toLowerCase().replace(/\s+/g, '_');
  const map = {
    created: 'placed',
    sent_to_vendor: 'placed',
    senttovendor: 'placed',
    new: 'placed',
    placed: 'placed',
    accepted: 'accepted',
    preparing: 'preparing',
    ready: 'ready',
    assigned: 'assigned',
    picked_up: 'picked_up',
    pickedup: 'picked_up',
    delivered: 'delivered',
    completed: 'delivered',
    declined: 'declined',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    needs_reassign: 'ready',
  };
  return map[key] || 'unknown';
};

const labelForStatus = (status) => {
  const normalized = normalizeStatus(status);
  if (!normalized || normalized === 'unknown') return 'Unknown';
  return normalized
    .toString()
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

export const StatusChip = ({ status }) => {
  const canonical = normalizeStatus(status);
  return (
    <span className={`status-pill status-${canonical.toLowerCase()}`}>
      {labelForStatus(status)}
    </span>
  );
};
