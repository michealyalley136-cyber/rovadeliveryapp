import 'dart:convert';
import 'package:http/http.dart' as http;

import '../config.dart';

class ApiException implements Exception {
  final String message;
  ApiException(this.message);
  @override
  String toString() => message;
}

class ApiClient {
  static Uri _uri(String path) => Uri.parse('$apiBaseUrl$path');

  static Future<Map<String, dynamic>> getJson(String path) async {
    return _request('GET', path);
  }

  static Future<Map<String, dynamic>> postJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    return _request('POST', path, body: body);
  }

  static Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final url = _uri(path);
    http.Response res;
    try {
      if (method == 'GET') {
        res = await http.get(url);
      } else {
        res = await http.post(
          url,
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode(body ?? {}),
        );
      }
    } catch (e) {
      throw ApiException('$method $path -> 0 ${e.toString()}');
    }

    final text = res.body;
    Map<String, dynamic>? data;
    if (text.isNotEmpty) {
      try {
        final decoded = jsonDecode(text);
        if (decoded is Map<String, dynamic>) {
          data = decoded;
        }
      } catch (_) {
        data = null;
      }
    }

    if (res.statusCode < 200 || res.statusCode >= 300) {
      final detail = data?['error'] ??
          data?['message'] ??
          data?['details'] ??
          data?['msg'] ??
          (text.isNotEmpty ? text : 'Request failed');
      throw ApiException('$method $path -> ${res.statusCode} $detail');
    }

    return data ?? {};
  }
}
