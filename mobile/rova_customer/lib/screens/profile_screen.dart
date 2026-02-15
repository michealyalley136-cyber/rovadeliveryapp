import 'package:flutter/material.dart';

import '../config.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Login / Register – wire to /api/auth/customer'),
            const SizedBox(height: 16),
            Text('API: $apiBaseUrl', style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}
