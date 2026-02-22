import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../models/vendor.dart';
import '../services/api_client.dart';

class VendorsScreen extends StatefulWidget {
  const VendorsScreen({super.key});

  @override
  State<VendorsScreen> createState() => _VendorsScreenState();
}

class _VendorsScreenState extends State<VendorsScreen> {
  bool _loading = true;
  String? _error;
  List<Vendor> _vendors = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await ApiClient.getJson('/api/public/vendors');
      final list = (data['vendors'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(Vendor.fromJson)
          .toList();
      setState(() => _vendors = list);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Vendors')),
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
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: _vendors.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (context, index) {
                    final vendor = _vendors[index];
                    return Card(
                      child: ListTile(
                        title: Text(vendor.name),
                        subtitle: vendor.addressText != null
                            ? Text(vendor.addressText!)
                            : null,
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => context.go(
                          '/vendors/${vendor.id}',
                          extra: vendor,
                        ),
                      ),
                    );
                  },
                ),
    );
  }
}
