import 'dart:math';

import '../models/cart_item.dart';

class CartModel {
  int? vendorId;
  String? vendorName;
  double? baseDeliveryFeeGhs;
  double? perKmFeeGhs;
  double? serviceFeePercent;
  double? minimumServiceFeeGhs;
  final List<CartItem> items = [];

  int get itemCount => items.fold(0, (sum, item) => sum + item.qty);

  int get subtotalCents =>
      items.fold(0, (sum, item) => sum + item.priceCents * item.qty);

  double get subtotalGhs => subtotalCents / 100.0;

  void setVendor(
    int id,
    String? name, {
    double? baseDeliveryFeeGhs,
    double? perKmFeeGhs,
    double? serviceFeePercent,
    double? minimumServiceFeeGhs,
  }) {
    vendorId = id;
    vendorName = name;
    this.baseDeliveryFeeGhs = baseDeliveryFeeGhs;
    this.perKmFeeGhs = perKmFeeGhs;
    this.serviceFeePercent = serviceFeePercent;
    this.minimumServiceFeeGhs = minimumServiceFeeGhs;
  }

  void clear() {
    items.clear();
    vendorId = null;
    vendorName = null;
    baseDeliveryFeeGhs = null;
    perKmFeeGhs = null;
    serviceFeePercent = null;
    minimumServiceFeeGhs = null;
  }

  void addItem({
    required int vendorId,
    required String vendorName,
    required int menuItemId,
    required String name,
    required int priceCents,
    required int qty,
    String? notes,
    required bool allowSubstitution,
    String? substitutionNote,
    double? baseDeliveryFeeGhs,
    double? perKmFeeGhs,
    double? serviceFeePercent,
    double? minimumServiceFeeGhs,
  }) {
    if (this.vendorId == null) {
      setVendor(
        vendorId,
        vendorName,
        baseDeliveryFeeGhs: baseDeliveryFeeGhs,
        perKmFeeGhs: perKmFeeGhs,
        serviceFeePercent: serviceFeePercent,
        minimumServiceFeeGhs: minimumServiceFeeGhs,
      );
    }
    final id = '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(9999)}';
    items.add(CartItem(
      id: id,
      menuItemId: menuItemId,
      name: name,
      priceCents: priceCents,
      qty: qty,
      notes: notes,
      allowSubstitution: allowSubstitution,
      substitutionNote: substitutionNote,
    ));
  }

  void updateQty(String id, int qty) {
    final idx = items.indexWhere((item) => item.id == id);
    if (idx < 0) return;
    if (qty <= 0) {
      items.removeAt(idx);
      return;
    }
    items[idx].qty = qty;
  }

  void removeItem(String id) {
    items.removeWhere((item) => item.id == id);
  }
}
