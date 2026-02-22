class MenuItem {
  final int id;
  final String name;
  final int priceCents;
  final String? description;
  final String? category;
  final String? imageUrl;

  MenuItem({
    required this.id,
    required this.name,
    required this.priceCents,
    this.description,
    this.category,
    this.imageUrl,
  });

  factory MenuItem.fromJson(Map<String, dynamic> json) {
    return MenuItem(
      id: json['id'] is int ? json['id'] as int : int.tryParse('${json['id']}') ?? 0,
      name: (json['name'] ?? '').toString(),
      priceCents: json['price_cents'] is int
          ? json['price_cents'] as int
          : int.tryParse('${json['price_cents']}') ?? 0,
      description: json['description']?.toString(),
      category: json['category']?.toString(),
      imageUrl: json['image_url']?.toString(),
    );
  }
}
