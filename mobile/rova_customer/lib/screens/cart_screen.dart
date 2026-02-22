import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../services/api_client.dart';
import '../services/fee_engine.dart';
import '../state/cart_model.dart';
import '../state/cart_provider.dart';

class CartScreen extends StatefulWidget {
  const CartScreen({super.key});

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  FeeConfig? _feeConfig;

  @override
  void initState() {
    super.initState();
    _loadPricing();
  }

  Future<void> _loadPricing() async {
    try {
      final data = await ApiClient.getJson('/api/pricing');
      final config = data['config'] as Map<String, dynamic>?;
      if (config != null) {
        setState(() => _feeConfig = FeeConfig.fromPricing(config));
      }
    } catch (_) {
      // Ignore pricing failures; show subtotal-only totals
    }
  }

  @override
  Widget build(BuildContext context) {
    final cartNotifier = CartProvider.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Cart')),
      body: ValueListenableBuilder<CartModel>(
        valueListenable: cartNotifier,
        builder: (context, cart, _) {
          if (cart.items.isEmpty) {
            return const Center(child: Text('Your cart is empty.'));
          }

          final fees = computeFeeBreakdown(
            subtotal: cart.subtotalGhs,
            config: _feeConfig,
            baseDeliveryFeeOverride: cart.baseDeliveryFeeGhs,
            perKmFeeOverride: cart.perKmFeeGhs,
            serviceFeePercentOverride: cart.serviceFeePercent,
            minimumServiceFeeOverride: cart.minimumServiceFeeGhs,
          );

          return Column(
            children: [
              Expanded(
                child: ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: cart.items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (context, index) {
                    final item = cart.items[index];
                    return Card(
                      child: ListTile(
                        title: Text(item.name),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('GHS ${(item.priceCents / 100).toStringAsFixed(2)}'),
                            if (item.notes != null && item.notes!.isNotEmpty)
                              Text('Notes: ${item.notes}'),
                            if (item.allowSubstitution && (item.substitutionNote ?? '').isNotEmpty)
                              Text('Substitute: ${item.substitutionNote}'),
                          ],
                        ),
                        trailing: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                IconButton(
                                  icon: const Icon(Icons.remove_circle_outline),
                                  onPressed: () {
                                    cart.updateQty(item.id, item.qty - 1);
                                    cartNotifier.notifyListeners();
                                  },
                                ),
                                Text('${item.qty}'),
                                IconButton(
                                  icon: const Icon(Icons.add_circle_outline),
                                  onPressed: () {
                                    cart.updateQty(item.id, item.qty + 1);
                                    cartNotifier.notifyListeners();
                                  },
                                ),
                              ],
                            ),
                            TextButton(
                              onPressed: () {
                                cart.removeItem(item.id);
                                cartNotifier.notifyListeners();
                              },
                              child: const Text('Remove'),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Subtotal: GHS ${fees.subtotal.toStringAsFixed(2)}'),
                    Text('Delivery fee: GHS ${fees.deliveryFee.toStringAsFixed(2)}'),
                    Text('Service fee: GHS ${fees.serviceFee.toStringAsFixed(2)}'),
                    Text('Total: GHS ${fees.total.toStringAsFixed(2)}'),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: () => context.go('/checkout'),
                      child: const Text('Checkout'),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
