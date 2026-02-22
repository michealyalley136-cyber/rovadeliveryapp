const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export const computeFeeBreakdown = ({ subtotal, config, vendor, distanceKm } = {}) => {
  const safeSubtotal = toNumber(subtotal, 0);
  const baseKm = toNumber(config?.base_km, 3);
  const baseDeliveryFee = toNumber(
    vendor?.base_delivery_fee_ghs ?? config?.base_fee_ghs,
    12
  );
  const perKmFee = toNumber(
    vendor?.per_km_fee_ghs ?? config?.per_km_fee_ghs,
    2
  );
  const serviceFeePercent = toNumber(
    vendor?.service_fee_percent ?? config?.service_fee_percent,
    0
  );
  const minimumServiceFee = toNumber(
    vendor?.minimum_service_fee_ghs ?? config?.minimum_service_fee_ghs,
    0
  );

  let deliveryFee = baseDeliveryFee;
  if (distanceKm != null && Number.isFinite(distanceKm)) {
    const km = Number(distanceKm);
    if (km > baseKm && perKmFee > 0) {
      deliveryFee = baseDeliveryFee + (km - baseKm) * perKmFee;
    }
  }

  let serviceFee = safeSubtotal * (serviceFeePercent / 100);
  if (serviceFee < minimumServiceFee) {
    serviceFee = minimumServiceFee;
  }

  const total = safeSubtotal + deliveryFee + serviceFee;

  return {
    subtotal: safeSubtotal,
    deliveryFee,
    serviceFee,
    total,
    serviceFeePercent,
    minimumServiceFee,
  };
};
