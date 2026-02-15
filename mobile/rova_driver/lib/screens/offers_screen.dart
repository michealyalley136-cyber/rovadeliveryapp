import 'package:flutter/material.dart';

class OffersScreen extends StatelessWidget {
  const OffersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Order offers')),
      body: const Center(
        child: Text('Offers – wire to GET /api/driver/offers, accept/decline'),
      ),
    );
  }
}
