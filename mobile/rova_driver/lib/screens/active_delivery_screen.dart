import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/driver_api.dart';

class ActiveDeliveryScreen extends StatefulWidget {
  const ActiveDeliveryScreen({super.key, required this.orderId});

  final int orderId;

  @override
  State<ActiveDeliveryScreen> createState() => _ActiveDeliveryScreenState();
}

class _ActiveDeliveryScreenState extends State<ActiveDeliveryScreen> {
  Map<String, dynamic>? _order;
  bool _loading = true;
  String? _error;
  bool _actionLoading = false;

  @override
  void initState() {
    super.initState();
    _loadOrder();
  }

  Future<void> _loadOrder() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await DriverApi.getMyOrders();
      final orders = data['orders'] as List<dynamic>? ?? [];
      final o = orders.cast<Map<String, dynamic>?>().firstWhere(
        (x) => (x?['id'] as int?) == widget.orderId,
        orElse: () => null,
      );
      if (mounted) {
        setState(() {
          _order = o;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _markPickedUp() async {
    setState(() {
      _actionLoading = true;
      _error = null;
    });
    try {
      await DriverApi.markPickedUp(widget.orderId);
      if (mounted) {
        setState(() => _actionLoading = false);
        _loadOrder();
      }
    } on DriverApiException catch (e) {
      if (mounted) setState(() {
        _actionLoading = false;
        _error = e.message;
      });
    } catch (e) {
      if (mounted) setState(() {
        _actionLoading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _markDelivered() async {
    setState(() {
      _actionLoading = true;
      _error = null;
    });
    try {
      await DriverApi.markDelivered(widget.orderId);
      if (mounted) {
        setState(() => _actionLoading = false);
        _loadOrder();
      }
    } on DriverApiException catch (e) {
      if (mounted) setState(() {
        _actionLoading = false;
        _error = e.message;
      });
    } catch (e) {
      if (mounted) setState(() {
        _actionLoading = false;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final order = _order;
    final status = order?['status'] as String? ?? '—';
    final isAssigned = status == 'Assigned';
    final isPickedUp = status == 'PickedUp';
    final isDelivered = status == 'Delivered';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Active delivery'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loading ? null : _loadOrder,
          ),
        ],
      ),
      body: _loading && order == null
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Order #${widget.orderId}', style: Theme.of(context).textTheme.titleLarge),
                          const SizedBox(height: 8),
                          Text('Status: $status', style: Theme.of(context).textTheme.titleMedium),
                          if (order != null && order['delivery_fee_ghs'] != null)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Text('Payout: GHS ${(order['delivery_fee_ghs'] as num).toStringAsFixed(2)}', style: const TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
                            ),
                        ],
                      ),
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    Text(_error!, style: const TextStyle(color: Colors.red)),
                  ],
                  const SizedBox(height: 24),
                  if (isAssigned)
                    FilledButton.icon(
                      onPressed: _actionLoading ? null : _markPickedUp,
                      icon: _actionLoading ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.inventory_2),
                      label: const Text('Mark Picked Up'),
                      style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
                    ),
                  if (isPickedUp) ...[
                    FilledButton.icon(
                      onPressed: _actionLoading ? null : _markDelivered,
                      icon: _actionLoading ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.done_all),
                      label: const Text('Mark Delivered'),
                      style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
                    ),
                  ],
                  if (isDelivered) ...[
                    const Icon(Icons.check_circle, color: Colors.green, size: 64),
                    const SizedBox(height: 16),
                    const Text('Delivery completed.', textAlign: TextAlign.center, style: TextStyle(fontSize: 18)),
                    const SizedBox(height: 24),
                    OutlinedButton(
                      onPressed: () => context.go('/'),
                      child: const Text('Back to Home'),
                    ),
                  ],
                ],
              ),
            ),
    );
  }
}
