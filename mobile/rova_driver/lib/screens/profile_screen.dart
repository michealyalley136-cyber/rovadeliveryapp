import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/driver_api.dart';
import '../config.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _emailController = TextEditingController(text: 'driver@rova.test');
  final _passwordController = TextEditingController(text: 'driver123');
  String? _error;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    if (DriverApi.token != null) _emailController.text = ''; // don't pre-fill when logged in
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    setState(() {
      _error = null;
      _loading = true;
    });
    try {
      await DriverApi.login(
        _emailController.text.trim(),
        _passwordController.text,
      );
      if (mounted) {
        setState(() => _loading = false);
        context.go('/');
      }
    } on DriverApiException catch (e) {
      if (mounted) setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _logout() {
    DriverApi.token = null;
    setState(() {
      _error = null;
      _emailController.text = 'driver@rova.test';
      _passwordController.text = 'driver123';
    });
  }

  @override
  Widget build(BuildContext context) {
    final isLoggedIn = DriverApi.token != null;

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (isLoggedIn) ...[
              const Icon(Icons.check_circle, color: Colors.green, size: 64),
              const SizedBox(height: 16),
              const Text('You are logged in.', textAlign: TextAlign.center, style: TextStyle(fontSize: 16)),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: _loading ? null : _logout,
                icon: const Icon(Icons.logout),
                label: const Text('Log out'),
              ),
            ] else ...[
              const Text('Driver login', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),
              TextField(
                controller: _emailController,
                decoration: const InputDecoration(
                  labelText: 'Email',
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.emailAddress,
                autocorrect: false,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _passwordController,
                decoration: const InputDecoration(
                  labelText: 'Password',
                  border: OutlineInputBorder(),
                ),
                obscureText: true,
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: const TextStyle(color: Colors.red)),
              ],
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _loading ? null : _login,
                child: _loading ? const SizedBox(height: 24, width: 24, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Log in'),
              ),
            ],
            const SizedBox(height: 32),
            Text('API: $apiBaseUrl', style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}
