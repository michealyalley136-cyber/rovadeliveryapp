import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/driver_api.dart';
import '../config.dart';

/// Mock location (Accra). Replace with GPS later.
const double mockLat = 5.6037;
const double mockLng = -0.1870;

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _isOnline = false;
  Timer? _pollTimer;
  Timer? _locationTimer;
  Timer? _offerTimer;
  Map<String, dynamic>? _currentOffer;
  int _offerSecondsRemaining = 0;
  bool _offerActionLoading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (DriverApi.token == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.go('/profile');
      });
    }
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _locationTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) => _fetchOffers());
    _locationTimer = Timer.periodic(const Duration(seconds: 10), (_) => _sendLocation());
    _fetchOffers();
    _sendLocation();
  }

  void _stopPolling() {
    _pollTimer?.cancel();
    _locationTimer?.cancel();
    _offerTimer?.cancel();
    _pollTimer = null;
    _locationTimer = null;
    setState(() {
      _currentOffer = null;
      _offerSecondsRemaining = 0;
    });
  }

  Future<void> _fetchOffers() async {
    if (DriverApi.token == null || !_isOnline) return;
    try {
      final data = await DriverApi.getOffers();
      final offer = data['offer'] as Map<String, dynamic>?;
      if (mounted && _isOnline) {
        setState(() {
          _error = null;
          _setOffer(offer);
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _sendLocation() async {
    if (DriverApi.token == null || !_isOnline) return;
    try {
      await DriverApi.postLocation(mockLat, mockLng);
      if (mounted) setState(() => _error = null);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _toggleOnline() async {
    if (DriverApi.token == null) {
      context.go('/profile');
      return;
    }
    setState(() => _error = null);
    try {
      if (_isOnline) {
        await DriverApi.goOffline();
        _stopPolling();
        setState(() => _isOnline = false);
      } else {
        await DriverApi.goOnline();
        setState(() => _isOnline = true);
        _startPolling();
      }
    } on DriverApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  @override
  void dispose() {
    _stopPolling();
    _offerTimer?.cancel();
    super.dispose();
  }

  void _setOffer(Map<String, dynamic>? offer) {
    _offerTimer?.cancel();
    _currentOffer = offer;
    _offerSecondsRemaining = (offer?['seconds_remaining'] as num?)?.toInt() ?? 0;
    if (_offerSecondsRemaining > 0) {
      _offerTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (!mounted) return;
        setState(() {
          if (_offerSecondsRemaining <= 1) {
            _offerSecondsRemaining = 0;
            _currentOffer = null;
            _offerTimer?.cancel();
          } else {
            _offerSecondsRemaining -= 1;
          }
        });
      });
    }
  }

  int? get _offerId {
    final v = _currentOffer?['id'];
    if (v is int) return v;
    if (v is num) return v.toInt();
    return null;
  }

  int? get _orderId {
    final order = _currentOffer?['order'] as Map<String, dynamic>?;
    final id = order?['id'];
    if (id is int) return id;
    if (id is num) return id.toInt();
    return null;
  }

  String get _pickupText {
    final order = _currentOffer?['order'] as Map<String, dynamic>?;
    return order?['pickup_text'] as String? ?? 'Pickup';
  }

  String get _dropoffText {
    final order = _currentOffer?['order'] as Map<String, dynamic>?;
    return order?['dropoff_text'] as String? ?? 'Dropoff';
  }

  double? get _payoutGhs {
    final order = _currentOffer?['order'] as Map<String, dynamic>?;
    final v = order?['delivery_fee_ghs'];
    if (v is int) return v.toDouble();
    if (v is double) return v;
    if (v is num) return v.toDouble();
    return null;
  }

  Future<void> _acceptOffer() async {
    final offerId = _offerId;
    if (offerId == null) return;
    setState(() {
      _offerActionLoading = true;
      _error = null;
    });
    try {
      await DriverApi.acceptOffer(offerId);
      final orderId = _orderId;
      if (mounted) {
        setState(() {
          _offerActionLoading = false;
          _setOffer(null);
        });
        if (orderId != null) {
          context.go('/delivery/$orderId');
        }
      }
    } on DriverApiException catch (e) {
      if (mounted) setState(() {
        _offerActionLoading = false;
        _error = e.message;
      });
    } catch (e) {
      if (mounted) setState(() {
        _offerActionLoading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _declineOffer() async {
    final offerId = _offerId;
    if (offerId == null) return;
    setState(() {
      _offerActionLoading = true;
      _error = null;
    });
    try {
      await DriverApi.declineOffer(offerId);
      if (mounted) {
        setState(() {
          _offerActionLoading = false;
          _setOffer(null);
        });
        _fetchOffers();
      }
    } on DriverApiException catch (e) {
      if (mounted) setState(() {
        _offerActionLoading = false;
        _error = e.message;
      });
    } catch (e) {
      if (mounted) setState(() {
        _offerActionLoading = false;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final offer = _currentOffer;
    final hasOffer = offer != null && offer['status'] == 'PENDING';
    final offerExpired = _offerSecondsRemaining <= 0;
    return Scaffold(
      appBar: AppBar(title: const Text('Online Status')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                _isOnline ? Icons.wifi : Icons.wifi_off,
                size: 80,
                color: _isOnline ? Colors.green : Colors.grey,
              ),
              const SizedBox(height: 16),
              Text(
                _isOnline ? 'You are online' : 'You are offline',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(
                _isOnline ? 'Polling for offers every 5s' : 'Go online to receive orders',
                style: Theme.of(context).textTheme.bodyMedium,
                textAlign: TextAlign.center,
              ),
              if (_error != null) ...[
                const SizedBox(height: 16),
                Text(_error!, style: const TextStyle(color: Colors.red), textAlign: TextAlign.center),
              ],
              if (hasOffer) ...[
                const SizedBox(height: 24),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (_payoutGhs != null)
                          Text(
                            'Payout: GHS ${_payoutGhs!.toStringAsFixed(2)}',
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.bold,
                                  color: Colors.green,
                                ),
                          ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            const Icon(Icons.store, size: 20),
                            const SizedBox(width: 8),
                            Expanded(child: Text(_pickupText)),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            const Icon(Icons.location_on, size: 20),
                            const SizedBox(width: 8),
                            Expanded(child: Text(_dropoffText)),
                          ],
                        ),
                        const SizedBox(height: 16),
                        Text(
                          offerExpired ? 'Offer expired' : '$_offerSecondsRemaining s to accept',
                          style: TextStyle(
                            color: offerExpired ? Colors.grey : (_offerSecondsRemaining <= 5 ? Colors.orange : null),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton(
                                onPressed: _offerActionLoading || offerExpired ? null : _declineOffer,
                                child: const Text('Decline'),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: FilledButton(
                                onPressed: _offerActionLoading || offerExpired ? null : _acceptOffer,
                                child: _offerActionLoading
                                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                                    : const Text('Accept'),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 32),
              FilledButton.icon(
                onPressed: _toggleOnline,
                icon: Icon(_isOnline ? Icons.stop : Icons.play_arrow),
                label: Text(_isOnline ? 'Go offline' : 'Go online'),
                style: FilledButton.styleFrom(
                  backgroundColor: _isOnline ? Colors.orange : Colors.green,
                  padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                ),
              ),
              const SizedBox(height: 24),
              OutlinedButton(
                onPressed: () => context.go('/orders'),
                child: const Text('My orders'),
              ),
              const SizedBox(height: 16),
              Text('API: $apiBaseUrl', style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ),
      bottomNavigationBar: NavigationBar(
        destinations: const [
          NavigationDestination(icon: Icon(Icons.wifi), label: 'Online'),
          NavigationDestination(icon: Icon(Icons.receipt_long), label: 'Orders'),
          NavigationDestination(icon: Icon(Icons.person), label: 'Profile'),
        ],
        onDestinationSelected: (i) {
          if (i == 1) context.go('/orders');
          if (i == 2) context.go('/profile');
        },
      ),
    );
  }
}
