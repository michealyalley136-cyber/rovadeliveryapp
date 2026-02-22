import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../services/api_client.dart';
import '../services/fee_engine.dart';
import '../state/cart_model.dart';
import '../state/cart_provider.dart';
import '../theme/app_colors.dart';

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _addressCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  final _promoCtrl = TextEditingController();
  bool _submitting = false;
  String? _error;
  FeeConfig? _feeConfig;
  bool _promoLoading = false;
  String? _promoError;
  int _discountCents = 0;
  String? _promoApplied;
  String _paymentMethod = 'cash';

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
      // Use default fee
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final cartNotifier = CartProvider.of(context);
    final cart = cartNotifier.value;
    if (cart.items.isEmpty || cart.vendorId == null) {
      setState(() => _error = 'Cart is empty.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });

    final items = cart.items
        .map((item) => {
              'name': item.name,
              'qty': item.qty,
              'unit_price': (item.priceCents / 100).toStringAsFixed(2),
              'notes': item.notes,
              'allow_substitution': item.allowSubstitution,
              'substitution_note': item.substitutionNote,
            })
        .toList();

    final payload = {
      'vendor_id': cart.vendorId,
      'customer_name': _nameCtrl.text.trim(),
      'customer_phone': _phoneCtrl.text.trim(),
      'dropoff_address': _addressCtrl.text.trim(),
      'items': items,
      'notes': _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
      'promo_code': _promoApplied,
      'payment_method': _paymentMethod,
    };

    try {
      final data = await ApiClient.postJson('/api/customer/orders', payload);
      cart.clear();
      cartNotifier.notifyListeners();
      if (!mounted) return;
      context.go('/confirmation', extra: data);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _submitting = false);
    }
  }

  Future<void> _applyPromo() async {
    final cart = CartProvider.of(context).value;
    final code = _promoCtrl.text.trim().toUpperCase();
    if (code.isEmpty) {
      setState(() => _promoError = 'Enter a promo code.');
      return;
    }
    if (cart.vendorId == null) {
      setState(() => _promoError = 'Select a vendor first.');
      return;
    }
    if (cart.subtotalCents <= 0) {
      setState(() => _promoError = 'Add items before applying promo.');
      return;
    }
    setState(() {
      _promoLoading = true;
      _promoError = null;
    });
    try {
      final data = await ApiClient.postJson('/api/customer/apply-promo', {
        'code': code,
        'vendor_id': cart.vendorId,
        'subtotal_cents': cart.subtotalCents,
      });
      final rawDiscount = data['discount_cents'];
      final discount = rawDiscount is num ? rawDiscount.toInt() : 0;
      setState(() {
        _promoApplied = data['promo_code']?.toString() ?? code;
        _discountCents = discount;
        _promoError = null;
      });
    } catch (e) {
      setState(() {
        _promoApplied = null;
        _discountCents = 0;
        _promoError = e.toString();
      });
    } finally {
      setState(() => _promoLoading = false);
    }
  }

  void _clearPromo() {
    setState(() {
      _promoApplied = null;
      _discountCents = 0;
      _promoError = null;
    });
    _promoCtrl.text = '';
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _addressCtrl.dispose();
    _notesCtrl.dispose();
    _promoCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cart = CartProvider.of(context).value;
    final subtotal = cart.subtotalGhs;
    final fees = computeFeeBreakdown(
      subtotal: subtotal,
      config: _feeConfig,
      baseDeliveryFeeOverride: cart.baseDeliveryFeeGhs,
      perKmFeeOverride: cart.perKmFeeGhs,
      serviceFeePercentOverride: cart.serviceFeePercent,
      minimumServiceFeeOverride: cart.minimumServiceFeeGhs,
    );
    final discountGhs = _discountCents / 100.0;
    final totalWithDiscount = (fees.total - discountGhs).clamp(0, double.infinity);

    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: ListView(
            children: [
              TextFormField(
                controller: _nameCtrl,
                decoration: const InputDecoration(labelText: 'Customer name'),
                validator: (val) => (val == null || val.trim().isEmpty) ? 'Required' : null,
              ),
              TextFormField(
                controller: _phoneCtrl,
                decoration: const InputDecoration(labelText: 'Phone'),
                validator: (val) => (val == null || val.trim().isEmpty) ? 'Required' : null,
              ),
              TextFormField(
                controller: _addressCtrl,
                decoration: const InputDecoration(labelText: 'Delivery address'),
                validator: (val) => (val == null || val.trim().isEmpty) ? 'Required' : null,
              ),
              TextFormField(
                controller: _notesCtrl,
                decoration: const InputDecoration(labelText: 'Delivery notes (optional)'),
                maxLines: 2,
              ),
              const SizedBox(height: 16),
              const Text('Payment method', style: TextStyle(fontWeight: FontWeight.w600)),
              RadioListTile<String>(
                title: const Text('Cash on delivery'),
                value: 'cash',
                groupValue: _paymentMethod,
                onChanged: (value) {
                  if (value == null) return;
                  setState(() => _paymentMethod = value);
                },
              ),
              RadioListTile<String>(
                title: const Text('Mobile Money (MoMo)'),
                value: 'momo',
                groupValue: _paymentMethod,
                onChanged: (value) {
                  if (value == null) return;
                  setState(() => _paymentMethod = value);
                },
              ),
              const ListTile(
                title: Text('Card (coming soon)'),
                enabled: false,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _promoCtrl,
                decoration: InputDecoration(
                  labelText: 'Promo code',
                  suffixIcon: _promoApplied != null
                      ? IconButton(
                          icon: const Icon(Icons.clear),
                          onPressed: _clearPromo,
                        )
                      : null,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  FilledButton.tonal(
                    onPressed: _promoLoading ? null : _applyPromo,
                    child: Text(_promoLoading ? 'Applying...' : 'Apply promo'),
                  ),
                  if (_promoApplied != null) ...[
                    const SizedBox(width: 12),
                    Text('Applied $_promoApplied', style: const TextStyle(color: AppColors.success)),
                  ],
                ],
              ),
              if (_promoError != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(_promoError!, style: const TextStyle(color: AppColors.danger)),
                ),
              const SizedBox(height: 16),
              Text('Subtotal: GHS ${fees.subtotal.toStringAsFixed(2)}'),
              Text('Delivery fee: GHS ${fees.deliveryFee.toStringAsFixed(2)}'),
              Text('Service fee: GHS ${fees.serviceFee.toStringAsFixed(2)}'),
              if (_discountCents > 0)
                Text('Discount: -GHS ${(_discountCents / 100).toStringAsFixed(2)}'),
              Text('Total: GHS ${totalWithDiscount.toStringAsFixed(2)}'),
              const SizedBox(height: 12),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(_error!, style: const TextStyle(color: AppColors.danger)),
                ),
              FilledButton(
                onPressed: _submitting ? null : _submit,
                child: Text(_submitting ? 'Placing order...' : 'Place order'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
