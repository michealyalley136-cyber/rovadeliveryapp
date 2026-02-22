class CartItem {
  final String id;
  final int menuItemId;
  final String name;
  final int priceCents;
  int qty;
  final String? notes;
  final bool allowSubstitution;
  final String? substitutionNote;

  CartItem({
    required this.id,
    required this.menuItemId,
    required this.name,
    required this.priceCents,
    required this.qty,
    this.notes,
    required this.allowSubstitution,
    this.substitutionNote,
  });

  double get totalGhs => (priceCents * qty) / 100.0;
}
