import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/driver_api.dart';

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  List<Map<String, dynamic>> _orders = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (DriverApi.token == null) {
      setState(() {
        _loading = false;
        _orders = [];
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await DriverApi.getMyOrders();
      final list = data['orders'] as List<dynamic>? ?? [];
      if (mounted) setState(() {
        _orders = list.cast<Map<String, dynamic>>();
        _loading = false;
      });
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
    if (DriverApi.token == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('My orders')),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('Log in to see your orders.'),
              const SizedBox(height: 16),
              FilledButton(onPressed: () => context.go('/profile'), child: const Text('Log in')),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('My orders'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loading ? null : _load),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!, style: const TextStyle(color: Colors.red)))
              : _orders.isEmpty
                  ? const Center(child: Text('No orders yet.'))
                  : ListView.builder(
                      itemCount: _orders.length,
                      itemBuilder: (context, i) {
                        final o = _orders[i];
                        final id = o['id'] as int?;
                        final status = o['status'] as String? ?? '—';
                        final isActive = status == 'Assigned' || status == 'PickedUp';
                        return ListTile(
                          title: Text('Order #$id'),
                          subtitle: Text(status),
                          trailing: isActive ? IconButton(icon: const Icon(Icons.open_in_new), onPressed: () => context.push('/delivery/$id')) : null,
                        );
                      },
                    ),
    );
  }
}
