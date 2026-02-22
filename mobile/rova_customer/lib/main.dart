import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'config.dart';
import 'screens/home_screen.dart';
import 'screens/vendors_screen.dart';
import 'screens/orders_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/vendor_menu_screen.dart';
import 'screens/cart_screen.dart';
import 'screens/checkout_screen.dart';
import 'screens/order_confirmation_screen.dart';
import 'screens/order_status_screen.dart';
import 'state/cart_model.dart';
import 'state/cart_provider.dart';
import 'theme/app_theme.dart';

void main() {
  runApp(const RovaCustomerApp());
}

final _cart = ValueNotifier(CartModel());

final _router = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
    GoRoute(path: '/vendors', builder: (_, __) => const VendorsScreen()),
    GoRoute(
      path: '/vendors/:id',
      builder: (context, state) {
        final id = int.tryParse(state.pathParameters['id'] ?? '');
        return VendorMenuScreen(vendorId: id ?? 0, vendor: state.extra);
      },
    ),
    GoRoute(path: '/cart', builder: (_, __) => const CartScreen()),
    GoRoute(path: '/checkout', builder: (_, __) => const CheckoutScreen()),
    GoRoute(
      path: '/confirmation',
      builder: (context, state) => OrderConfirmationScreen(order: state.extra),
    ),
    GoRoute(path: '/orders', builder: (_, __) => const OrdersScreen()),
    GoRoute(
      path: '/orders/:id',
      builder: (context, state) {
        final id = int.tryParse(state.pathParameters['id'] ?? '');
        final token = state.uri.queryParameters['token'];
        return OrderStatusScreen(orderId: id ?? 0, token: token);
      },
    ),
    GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
  ],
);

class RovaCustomerApp extends StatelessWidget {
  const RovaCustomerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return CartProvider(
      notifier: _cart,
      child: MaterialApp.router(
        title: 'ROVA Customer',
        theme: AppTheme.light(),
        routerConfig: _router,
      ),
    );
  }
}
