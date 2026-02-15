import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config.dart';

/// API client for driver endpoints. Set [token] after login.
class DriverApi {
  static String? _token;
  static String? get token => _token;
  static set token(String? value) => _token = value;

  static String get _base => apiBaseUrl.endsWith('/') ? apiBaseUrl : '$apiBaseUrl/';
  static String get _api => '${_base}api/';
  static String get _drivers => '${_api}drivers';

  static Map<String, String> get _headers {
    final m = <String, String>{'Accept': 'application/json', 'Content-Type': 'application/json'};
    if (_token != null) m['Authorization'] = 'Bearer $_token';
    return m;
  }

  /// POST /api/auth/driver/login
  static Future<Map<String, dynamic>> login(String email, String password) async {
    final r = await http.post(
      Uri.parse('${_api}auth/driver/login'),
      headers: _headers,
      body: jsonEncode({'email': email, 'password': password}),
    );
    final body = jsonDecode(r.body) as Map<String, dynamic>? ?? {};
    if (r.statusCode >= 200 && r.statusCode < 300) {
      _token = body['access_token'] as String?;
      return body;
    }
    throw DriverApiException(body['error'] as String? ?? 'Login failed', r.statusCode);
  }

  /// GET /api/drivers/me/offers
  static Future<Map<String, dynamic>> getOffers() async {
    final r = await http.get(Uri.parse('${_drivers}/me/offers'), headers: _headers);
    final body = jsonDecode(r.body) as Map<String, dynamic>? ?? {};
    if (r.statusCode >= 200 && r.statusCode < 300) return body;
    throw DriverApiException(body['error'] as String? ?? 'Failed to fetch offers', r.statusCode);
  }

  /// POST /api/drivers/me/offers/{id}/accept
  static Future<Map<String, dynamic>> acceptOffer(int offerId) async {
    final r = await http.post(
      Uri.parse('${_drivers}/me/offers/$offerId/accept'),
      headers: _headers,
    );
    final body = jsonDecode(r.body) as Map<String, dynamic>? ?? {};
    if (r.statusCode >= 200 && r.statusCode < 300) return body;
    throw DriverApiException(body['error'] as String? ?? 'Accept failed', r.statusCode);
  }

  /// POST /api/drivers/me/offers/{id}/decline
  static Future<Map<String, dynamic>> declineOffer(int offerId) async {
    final r = await http.post(
      Uri.parse('${_drivers}/me/offers/$offerId/decline'),
      headers: _headers,
    );
    final body = jsonDecode(r.body) as Map<String, dynamic>? ?? {};
    if (r.statusCode >= 200 && r.statusCode < 300) return body;
    throw DriverApiException(body['error'] as String? ?? 'Decline failed', r.statusCode);
  }

  /// POST /api/drivers/me/location
  static Future<void> postLocation(double lat, double lng) async {
    final r = await http.post(
      Uri.parse('${_drivers}/me/location'),
      headers: _headers,
      body: jsonEncode({'lat': lat, 'lng': lng}),
    );
    if (r.statusCode < 200 || r.statusCode >= 300) {
      final body = jsonDecode(r.body) as Map<String, dynamic>? ?? {};
      throw DriverApiException(body['error'] as String? ?? 'Location update failed', r.statusCode);
    }
  }

  /// POST /api/drivers/me/online
  static Future<void> setOnline(bool isOnline) async {
    final r = await http.post(
      Uri.parse('${_drivers}/me/online'),
      headers: _headers,
      body: jsonEncode({'is_online': isOnline}),
    );
    if (r.statusCode < 200 || r.statusCode >= 300) {
      final body = jsonDecode(r.body) as Map<String, dynamic>? ?? {};
      throw DriverApiException(body['error'] as String? ?? 'Go online failed', r.statusCode);
    }
  }

  static Future<void> goOnline() async => setOnline(true);
  static Future<void> goOffline() async => setOnline(false);

  /// GET /api/drivers/orders (list my orders)
  static Future<Map<String, dynamic>> getMyOrders() async {
    final r = await http.get(Uri.parse('${_drivers}/orders'), headers: _headers);
    final body = jsonDecode(r.body) as Map<String, dynamic>? ?? {};
    if (r.statusCode >= 200 && r.statusCode < 300) return body;
    throw DriverApiException(body['error'] as String? ?? 'Failed to fetch orders', r.statusCode);
  }

  /// POST /api/orders/{orderId}/status
  static Future<Map<String, dynamic>> updateOrderStatus(int orderId, String status) async {
    final r = await http.post(
      Uri.parse('${_api}orders/$orderId/status'),
      headers: _headers,
      body: jsonEncode({'status': status}),
    );
    final body = jsonDecode(r.body) as Map<String, dynamic>? ?? {};
    if (r.statusCode >= 200 && r.statusCode < 300) return body;
    throw DriverApiException(body['error'] as String? ?? 'Update status failed', r.statusCode);
  }

  static Future<Map<String, dynamic>> markPickedUp(int orderId) => updateOrderStatus(orderId, 'PICKED_UP');
  static Future<Map<String, dynamic>> markDelivered(int orderId) => updateOrderStatus(orderId, 'DELIVERED');
}

class DriverApiException implements Exception {
  final String message;
  final int statusCode;
  DriverApiException(this.message, this.statusCode);
  @override
  String toString() => message;
}
