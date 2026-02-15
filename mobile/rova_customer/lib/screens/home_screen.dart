import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../config.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('ROVA')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Bike-first food delivery', style: TextStyle(fontSize: 18)),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () => context.go('/vendors'),
              child: const Text('Browse vendors'),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: () => context.go('/orders'),
              child: const Text('My orders'),
            ),
            const SizedBox(height: 8),
            Text('API: $apiBaseUrl', style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.restaurant), label: 'Vendors'),
          NavigationDestination(icon: Icon(Icons.receipt_long), label: 'Orders'),
          NavigationDestination(icon: Icon(Icons.person), label: 'Profile'),
        ],
        onDestinationSelected: (i) {
          if (i == 1) context.go('/vendors');
          if (i == 2) context.go('/orders');
          if (i == 3) context.go('/profile');
        },
      ),
    );
  }
}
