import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../services/api_client.dart';
import '../theme/app_colors.dart';

class OrderStatusScreen extends StatefulWidget {
  final int orderId;
  final String? token;

  const OrderStatusScreen({super.key, required this.orderId, this.token});

  @override
  State<OrderStatusScreen> createState() => _OrderStatusScreenState();
}

class _OrderStatusScreenState extends State<OrderStatusScreen> {
  Map<String, dynamic>? _order;
  String? _error;
  bool _loading = true;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _fetch();
    _timer = Timer.periodic(const Duration(seconds: 12), (_) => _fetch(silent: true));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  String _normalizeStatus(String? status) {
    final raw = (status ?? '').trim().toLowerCase().replaceAll(' ', '_');
    const map = {
      'new': 'placed',
      'created': 'placed',
      'sent_to_vendor': 'placed',
      'senttovendor': 'placed',
      'placed': 'placed',
      'accepted': 'accepted',
      'preparing': 'preparing',
      'ready': 'ready',
      'assigned': 'assigned',
      'picked_up': 'picked_up',
      'pickedup': 'picked_up',
      'delivered': 'delivered',
      'completed': 'delivered',
      'declined': 'declined',
      'cancelled': 'cancelled',
      'canceled': 'cancelled',
    };
    return map[raw] ?? raw;
  }

  String _labelForStatus(String status) {
    if (status.isEmpty) return 'Unknown';
    final words = status.replaceAll('_', ' ').split(' ');
    return words
        .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
        .join(' ');
  }

  String _two(int value) => value.toString().padLeft(2, '0');

  String _formatTimestamp(String? value) {
    if (value == null || value.isEmpty) return '';
    final dt = DateTime.tryParse(value);
    if (dt == null) return value;
    final local = dt.toLocal();
    return '${local.year}-${_two(local.month)}-${_two(local.day)} ${_two(local.hour)}:${_two(local.minute)}';
  }

  Future<void> _fetch({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    final token = widget.token;
    final path = token == null || token.isEmpty
        ? '/api/customer/orders/${widget.orderId}'
        : '/api/customer/orders/${widget.orderId}?token=$token';
    try {
      final data = await ApiClient.getJson(path);
      setState(() {
        _order = data;
        _error = null;
      });
    } catch (e) {
      if (!silent) {
        setState(() => _error = e.toString());
      }
    } finally {
      if (!silent) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final order = _order;
    final status = _normalizeStatus(order?['status']?.toString());
    final timeline = order?['timeline'] is List ? (order?['timeline'] as List) : [];
    final timelineMap = <String, String>{};
    for (final entry in timeline) {
      if (entry is Map && entry['status'] != null && entry['timestamp'] != null) {
        timelineMap[entry['status'].toString()] = entry['timestamp'].toString();
      }
    }
    final driver = order?['driver'] is Map ? order?['driver'] as Map : null;
    final driverName = (driver?['name'] ?? driver?['full_name'] ?? '').toString();
    final driverPhone = (driver?['phone'] ?? '').toString();
    final driverLocation =
        order?['driver_location'] is Map ? order?['driver_location'] as Map : null;
    final driverLat = driverLocation?['lat'];
    final driverLng = driverLocation?['lng'];
    final driverLocationUpdated = _formatTimestamp(driverLocation?['updated_at']?.toString());

    const flow = ['placed', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered'];
    const terminal = ['declined', 'cancelled'];
    final steps = <String>[...flow];
    if (terminal.contains(status)) {
      steps.add(status);
    }

    int flowIndex = flow.indexOf(status);
    final isTerminal = terminal.contains(status);

    return Scaffold(
      appBar: AppBar(
        title: Text('Order #${widget.orderId}'),
        actions: [
          IconButton(
            onPressed: () => _fetch(),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _loading && order == null
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: () => _fetch(),
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(_error!, style: const TextStyle(color: AppColors.danger)),
                    ),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                'Current status',
                                style: Theme.of(context).textTheme.titleMedium,
                              ),
                              const SizedBox(width: 12),
                              Chip(
                                label: Text(_labelForStatus(status)),
                                backgroundColor: AppColors.surface,
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Total: GHS ${(order?['totals']?['total'] ?? 0).toString()}',
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Driver', style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: 8),
                          if (driver != null)
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(driverName.isEmpty ? 'Driver assigned' : driverName),
                                if (driverPhone.isNotEmpty)
                                  Text(
                                    driverPhone,
                                    style: Theme.of(context).textTheme.bodySmall,
                                  ),
                              ],
                            )
                          else
                            const Text('Not assigned yet'),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Live tracking', style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: 8),
                          const Text('Live map coming soon'),
                          const SizedBox(height: 8),
                          if (driverLat != null && driverLng != null)
                            Text(
                              'Last location: ${driverLat.toString()}, ${driverLng.toString()}'
                              '${driverLocationUpdated.isNotEmpty ? ' - $driverLocationUpdated' : ''}',
                              style: Theme.of(context).textTheme.bodySmall,
                            )
                          else
                            Text(
                              'Driver location not available yet',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text('Timeline', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  ...steps.map((step) {
                    final stepIndex = flow.indexOf(step);
                    final hasTimestamp = timelineMap.containsKey(step);
                    final isCurrent = step == status;
                    final isComplete = hasTimestamp || (flowIndex >= 0 && stepIndex >= 0 && stepIndex <= flowIndex);
                    final icon = isCurrent
                        ? Icons.radio_button_checked
                        : isComplete
                            ? Icons.check_circle
                            : Icons.radio_button_unchecked;
                    final color = isTerminal && isCurrent
                        ? AppColors.danger
                        : isComplete
                            ? AppColors.success
                            : AppColors.muted;
                    final timestamp = timelineMap[step];
                    return ListTile(
                      dense: true,
                      leading: Icon(icon, color: color),
                      title: Text(_labelForStatus(step)),
                      subtitle: timestamp != null ? Text(_formatTimestamp(timestamp)) : null,
                    );
                  }),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: () => context.go('/vendors'),
                    child: const Text('Browse vendors'),
                  ),
                ],
              ),
            ),
    );
  }
}
