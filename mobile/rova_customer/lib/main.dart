import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'config.dart';
import 'screens/home_screen.dart';
import 'screens/vendors_screen.dart';
import 'screens/orders_screen.dart';
import 'screens/profile_screen.dart';

void main() {
  runApp(const RovaCustomerApp());
}

final _router = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
    GoRoute(path: '/vendors', builder: (_, __) => const VendorsScreen()),
    GoRoute(path: '/orders', builder: (_, __) => const OrdersScreen()),
    GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
  ],
);

class RovaCustomerApp extends StatelessWidget {
  const RovaCustomerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'ROVA Customer',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.orange),
        useMaterial3: true,
      ),
      routerConfig: _router,
    );
  }
}
