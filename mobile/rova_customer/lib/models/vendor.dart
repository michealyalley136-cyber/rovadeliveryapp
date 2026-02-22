class Vendor {
  final int id;
  final String name;
  final String? addressText;
  final String? whatsappNumber;
  final double? baseDeliveryFeeGhs;
  final double? perKmFeeGhs;
  final double? serviceFeePercent;
  final double? minimumServiceFeeGhs;

  Vendor({
    required this.id,
    required this.name,
    this.addressText,
    this.whatsappNumber,
    this.baseDeliveryFeeGhs,
    this.perKmFeeGhs,
    this.serviceFeePercent,
    this.minimumServiceFeeGhs,
  });

  static double? _toDouble(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString());
  }

  factory Vendor.fromJson(Map<String, dynamic> json) {
    return Vendor(
      id: json['id'] is int ? json['id'] as int : int.tryParse('${json['id']}') ?? 0,
      name: (json['name'] ?? '').toString(),
      addressText: json['address_text']?.toString(),
      whatsappNumber: json['whatsapp_number']?.toString(),
      baseDeliveryFeeGhs: _toDouble(json['base_delivery_fee_ghs']),
      perKmFeeGhs: _toDouble(json['per_km_fee_ghs']),
      serviceFeePercent: _toDouble(json['service_fee_percent']),
      minimumServiceFeeGhs: _toDouble(json['minimum_service_fee_ghs']),
    );
  }
}
