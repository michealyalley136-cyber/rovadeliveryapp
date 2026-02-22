class FeeConfig {
  final double baseKm;
  final double baseDeliveryFeeGhs;
  final double perKmFeeGhs;
  final double serviceFeePercent;
  final double minimumServiceFeeGhs;

  const FeeConfig({
    required this.baseKm,
    required this.baseDeliveryFeeGhs,
    required this.perKmFeeGhs,
    required this.serviceFeePercent,
    required this.minimumServiceFeeGhs,
  });

  factory FeeConfig.fromPricing(Map<String, dynamic> json) {
    double toDouble(dynamic value, double fallback) {
      if (value == null) return fallback;
      if (value is num) return value.toDouble();
      return double.tryParse(value.toString()) ?? fallback;
    }

    return FeeConfig(
      baseKm: toDouble(json['base_km'], 3),
      baseDeliveryFeeGhs: toDouble(json['base_fee_ghs'], 12),
      perKmFeeGhs: toDouble(json['per_km_fee_ghs'], 2),
      serviceFeePercent: toDouble(json['service_fee_percent'], 0),
      minimumServiceFeeGhs: toDouble(json['minimum_service_fee_ghs'], 0),
    );
  }
}

class FeeBreakdown {
  final double subtotal;
  final double deliveryFee;
  final double serviceFee;
  final double total;

  const FeeBreakdown({
    required this.subtotal,
    required this.deliveryFee,
    required this.serviceFee,
    required this.total,
  });
}

FeeBreakdown computeFeeBreakdown({
  required double subtotal,
  FeeConfig? config,
  double? distanceKm,
  double? baseDeliveryFeeOverride,
  double? perKmFeeOverride,
  double? serviceFeePercentOverride,
  double? minimumServiceFeeOverride,
}) {
  final cfg = config ??
      const FeeConfig(
        baseKm: 3,
        baseDeliveryFeeGhs: 12,
        perKmFeeGhs: 2,
        serviceFeePercent: 0,
        minimumServiceFeeGhs: 0,
      );

  final baseFee = baseDeliveryFeeOverride ?? cfg.baseDeliveryFeeGhs;
  final perKmFee = perKmFeeOverride ?? cfg.perKmFeeGhs;
  final servicePercent = serviceFeePercentOverride ?? cfg.serviceFeePercent;
  final minimumService = minimumServiceFeeOverride ?? cfg.minimumServiceFeeGhs;

  double deliveryFee = baseFee;
  if (distanceKm != null && perKmFee > 0) {
    if (distanceKm > cfg.baseKm) {
      deliveryFee = baseFee + (distanceKm - cfg.baseKm) * perKmFee;
    }
  }

  double serviceFee = subtotal * (servicePercent / 100.0);
  if (serviceFee < minimumService) {
    serviceFee = minimumService;
  }

  return FeeBreakdown(
    subtotal: subtotal,
    deliveryFee: deliveryFee,
    serviceFee: serviceFee,
    total: subtotal + deliveryFee + serviceFee,
  );
}
