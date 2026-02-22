import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../models/menu_item.dart';
import '../models/vendor.dart';
import '../services/api_client.dart';
import '../state/cart_model.dart';
import '../state/cart_provider.dart';
import '../theme/app_colors.dart';

class VendorMenuScreen extends StatefulWidget {
  final int vendorId;
  final Object? vendor;

  const VendorMenuScreen({super.key, required this.vendorId, this.vendor});

  @override
  State<VendorMenuScreen> createState() => _VendorMenuScreenState();
}

class _VendorMenuScreenState extends State<VendorMenuScreen> {
  bool _loading = true;
  String? _error;
  List<MenuItem> _items = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Vendor? get _vendor {
    final extra = widget.vendor;
    return extra is Vendor ? extra : null;
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await ApiClient.getJson('/api/public/vendors/${widget.vendorId}/menu');
      final list = (data['items'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(MenuItem.fromJson)
          .toList();
      setState(() => _items = list);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  Map<String, List<MenuItem>> _groupByCategory() {
    final Map<String, List<MenuItem>> grouped = {};
    for (final item in _items) {
      final key = (item.category == null || item.category!.isEmpty)
          ? 'Menu'
          : item.category!;
      grouped.putIfAbsent(key, () => []).add(item);
    }
    return grouped;
  }

  Future<void> _showItemDetails(MenuItem item) async {
    final cartNotifier = CartProvider.of(context);
    final cart = cartNotifier.value;
    if (cart.vendorId != null && cart.vendorId != widget.vendorId) {
      final shouldClear = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Switch vendor?'),
          content: const Text('Your cart has items from another vendor. Clear it?'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Clear cart')),
          ],
        ),
      );
      if (shouldClear != true) return;
      cart.clear();
      cartNotifier.notifyListeners();
    }

    int qty = 1;
    bool allowSub = false;
    final notesController = TextEditingController();
    final subController = TextEditingController();

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return StatefulBuilder(builder: (ctx, setState) {
          return Padding(
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(ctx).viewInsets.bottom,
              left: 16,
              right: 16,
              top: 16,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.name, style: Theme.of(ctx).textTheme.titleLarge),
                  const SizedBox(height: 4),
                  Text('GHS ${(item.priceCents / 100).toStringAsFixed(2)}'),
                  if (item.description != null && item.description!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(item.description!),
                    ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      IconButton(
                        onPressed: qty > 1 ? () => setState(() => qty--) : null,
                        icon: const Icon(Icons.remove_circle_outline),
                      ),
                      Text('$qty', style: Theme.of(ctx).textTheme.titleMedium),
                      IconButton(
                        onPressed: () => setState(() => qty++),
                        icon: const Icon(Icons.add_circle_outline),
                      ),
                    ],
                  ),
                  TextField(
                    controller: notesController,
                    decoration: const InputDecoration(
                      labelText: 'Notes (special instructions)',
                    ),
                    maxLines: 2,
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Checkbox(
                        value: allowSub,
                        onChanged: (val) => setState(() => allowSub = val ?? false),
                      ),
                      const Text('Allow substitutions'),
                    ],
                  ),
                  if (allowSub)
                    TextField(
                      controller: subController,
                      decoration: const InputDecoration(
                        labelText: 'Substitution notes',
                      ),
                      maxLines: 2,
                    ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: () {
                        cart.addItem(
                          vendorId: widget.vendorId,
                          vendorName: _vendor?.name ?? 'Vendor ${widget.vendorId}',
                          menuItemId: item.id,
                          name: item.name,
                          priceCents: item.priceCents,
                          qty: qty,
                          notes: notesController.text.trim().isEmpty
                              ? null
                              : notesController.text.trim(),
                          allowSubstitution: allowSub,
                          substitutionNote: allowSub && subController.text.trim().isNotEmpty
                              ? subController.text.trim()
                              : null,
                          baseDeliveryFeeGhs: _vendor?.baseDeliveryFeeGhs,
                          perKmFeeGhs: _vendor?.perKmFeeGhs,
                          serviceFeePercent: _vendor?.serviceFeePercent,
                          minimumServiceFeeGhs: _vendor?.minimumServiceFeeGhs,
                        );
                        cartNotifier.notifyListeners();
                        Navigator.pop(ctx);
                      },
                      child: const Text('Add to cart'),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
              ),
            ),
          );
        });
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final cartNotifier = CartProvider.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(_vendor?.name ?? 'Menu'),
        actions: [
          ValueListenableBuilder<CartModel>(
            valueListenable: cartNotifier,
            builder: (context, cart, _) {
              return IconButton(
                onPressed: cart.itemCount > 0 ? () => context.go('/cart') : null,
                icon: Stack(
                  alignment: Alignment.topRight,
                  children: [
                    const Icon(Icons.shopping_cart),
                    if (cart.itemCount > 0)
                      CircleAvatar(
                        radius: 8,
                        backgroundColor: AppColors.danger,
                        child: Text(
                          '${cart.itemCount}',
                          style: const TextStyle(fontSize: 10, color: AppColors.primaryForeground),
                        ),
                      ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(_error!, textAlign: TextAlign.center),
                      const SizedBox(height: 12),
                      FilledButton(onPressed: _load, child: const Text('Retry')),
                    ],
                  ),
                )
              : _items.isEmpty
                  ? const Center(child: Text('No menu items available.'))
                  : ListView(
                      padding: const EdgeInsets.all(16),
                      children: _groupByCategory().entries.map((entry) {
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(entry.key, style: Theme.of(context).textTheme.titleMedium),
                            const SizedBox(height: 8),
                            ...entry.value.map((item) => Card(
                                  child: ListTile(
                                    title: Text(item.name),
                                    subtitle: item.description != null
                                        ? Text(item.description!)
                                        : null,
                                    trailing: Text(
                                      'GHS ${(item.priceCents / 100).toStringAsFixed(2)}',
                                    ),
                                    onTap: () => _showItemDetails(item),
                                  ),
                                )),
                            const SizedBox(height: 16),
                          ],
                        );
                      }).toList(),
                    ),
    );
  }
}
