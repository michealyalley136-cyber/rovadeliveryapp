import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'config.dart';
import 'screens/active_delivery_screen.dart';
import 'screens/home_screen.dart';
import 'screens/offer_screen.dart';
import 'screens/orders_screen.dart';
import 'screens/profile_screen.dart';

void main() {
  runApp(const RovaDriverApp());
}

final _router = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
    GoRoute(
      path: '/offer',
      builder: (_, state) {
        final offer = state.extra as Map<String, dynamic>?;
        if (offer == null) return Scaffold(body: Center(child: Text('No offer data. API: $apiBaseUrl')));
        return OfferScreen(offer: offer);
      },
    ),
    GoRoute(
      path: '/delivery/:orderId',
      builder: (_, state) {
        final orderIdStr = state.pathParameters['orderId'];
        final orderId = orderIdStr != null ? int.tryParse(orderIdStr) : null;
        if (orderId == null) return const Scaffold(body: Center(child: Text('Invalid order')));
        return ActiveDeliveryScreen(orderId: orderId);
      },
    ),
    GoRoute(path: '/orders', builder: (_, __) => const OrdersScreen()),
    GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
  ],
);

class RovaDriverApp extends StatelessWidget {
  const RovaDriverApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'ROVA Driver',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.green),
        useMaterial3: true,
      ),
      routerConfig: _router,
    );
  }
}
