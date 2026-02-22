import 'package:flutter/material.dart';

import 'cart_model.dart';

class CartProvider extends InheritedNotifier<ValueNotifier<CartModel>> {
  const CartProvider({
    super.key,
    required ValueNotifier<CartModel> notifier,
    required Widget child,
  }) : super(notifier: notifier, child: child);

  static ValueNotifier<CartModel> of(BuildContext context) {
    final provider =
        context.dependOnInheritedWidgetOfExactType<CartProvider>();
    if (provider == null) {
      throw StateError('CartProvider not found in widget tree');
    }
    return provider.notifier!;
  }
}
