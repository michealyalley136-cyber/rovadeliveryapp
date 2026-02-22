import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/app_colors.dart';

class OrderConfirmationScreen extends StatelessWidget {
  final Object? order;

  const OrderConfirmationScreen({super.key, this.order});

  @override
  Widget build(BuildContext context) {
    final data = order is Map ? order as Map : {};
    final orderId = data['order_id'] ?? data['id'];
    final status = data['status'] ?? 'new';
    final token = data['token'] ?? data['order_public_token'];

    return Scaffold(
      appBar: AppBar(title: const Text('Order confirmed')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.check_circle, color: AppColors.success, size: 72),
              const SizedBox(height: 16),
              Text('Order #$orderId', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 8),
              Text('Status: $status'),
              const SizedBox(height: 24),
              if (orderId != null)
                FilledButton(
                  onPressed: () => context.go('/orders/$orderId?token=$token'),
                  child: const Text('Track order'),
                ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () => context.go('/vendors'),
                child: const Text('Back to vendors'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
