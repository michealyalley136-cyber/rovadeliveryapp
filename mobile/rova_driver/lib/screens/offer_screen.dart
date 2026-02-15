import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/driver_api.dart';

class OfferScreen extends StatefulWidget {
  const OfferScreen({super.key, required this.offer});

  final Map<String, dynamic> offer;

  @override
  State<OfferScreen> createState() => _OfferScreenState();
}

class _OfferScreenState extends State<OfferScreen> {
  int _secondsRemaining = 0;
  Timer? _timer;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _secondsRemaining = (widget.offer['seconds_remaining'] as num?)?.toInt() ?? 15;
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {
        if (_secondsRemaining <= 0) {
          _timer?.cancel();
          context.pop();
          return;
        }
        _secondsRemaining--;
      });
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  double? get _payoutGhs {
    final order = widget.offer['order'] as Map<String, dynamic>?;
    if (order == null) return null;
    final v = order['delivery_fee_ghs'];
    if (v == null) return null;
    if (v is int) return v.toDouble();
    if (v is double) return v;
    return null;
  }

  String get _pickupText {
    final order = widget.offer['order'] as Map<String, dynamic>?;
    return order?['pickup_text'] as String? ?? 'Pickup';
  }

  String get _dropoffText {
    final order = widget.offer['order'] as Map<String, dynamic>?;
    return order?['dropoff_text'] as String? ?? 'Dropoff';
  }

  int? get _orderId {
    final order = widget.offer['order'] as Map<String, dynamic>?;
    final id = order?['id'];
    if (id is int) return id;
    if (id is num) return id.toInt();
    return null;
  }

  int? get _offerId {
    final v = widget.offer['id'];
    if (v is int) return v;
    if (v is num) return v.toInt();
    return null;
  }

  Future<void> _accept() async {
    final id = _offerId;
    if (id == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await DriverApi.acceptOffer(id);
      final orderId = _orderId;
      if (mounted) {
        _timer?.cancel();
        setState(() => _loading = false);
        if (orderId != null) {
          context.go('/delivery/$orderId');
        } else {
          context.pop();
        }
      }
    } on DriverApiException catch (e) {
      if (mounted) setState(() {
        _loading = false;
        _error = e.message;
      });
    } catch (e) {
      if (mounted) setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _decline() async {
    final id = _offerId;
    if (id == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await DriverApi.declineOffer(id);
      if (mounted) {
        _timer?.cancel();
        setState(() => _loading = false);
        context.pop();
      }
    } on DriverApiException catch (e) {
      if (mounted) setState(() {
        _loading = false;
        _error = e.message;
      });
    } catch (e) {
      if (mounted) setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final payout = _payoutGhs;
    final expired = _secondsRemaining <= 0;

    return Scaffold(
      appBar: AppBar(title: const Text('New offer')),
      body: Padding(
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
                    if (payout != null)
                      Text(
                        'Payout: GHS ${payout.toStringAsFixed(2)}',
                        style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: Colors.green,
                        ),
                      ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        const Icon(Icons.store, size: 20),
                        const SizedBox(width: 8),
                        Expanded(child: Text(_pickupText, style: const TextStyle(fontSize: 16))),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        const Icon(Icons.location_on, size: 20),
                        const SizedBox(width: 8),
                        Expanded(child: Text(_dropoffText, style: const TextStyle(fontSize: 16))),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            Center(
              child: Column(
                children: [
                  Text(
                    expired ? 'Expired' : '$_secondsRemaining s',
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      color: expired ? Colors.grey : (_secondsRemaining <= 5 ? Colors.orange : null),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(expired ? '' : 'to accept', style: Theme.of(context).textTheme.bodyMedium),
                ],
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(_error!, style: const TextStyle(color: Colors.red)),
            ],
            const Spacer(),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _loading || expired ? null : _decline,
                    child: const Text('Decline'),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: FilledButton(
                    onPressed: _loading || expired ? null : _accept,
                    child: _loading ? const SizedBox(height: 24, width: 24, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Accept'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
