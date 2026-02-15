/// API base URL. Override at run time with:
/// flutter run --dart-define=API_BASE_URL=http://YOUR_IP:5000
/// For Android emulator use http://10.0.2.2:5000
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:5000',
);
