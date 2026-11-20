export const customerServices = [
  { id: "RIDE", title: "Book a Motorcycle", description: "Fast and affordable rides around the city.", image: "/customer-services/motorcycle.webp", color: "green", demo: true },
  { id: "TAXI", title: "Book a Cab", description: "Ride in comfort and safety.", image: "/customer-services/cab.webp", color: "gold", demo: true },
  { id: "FOOD", title: "Order Food", description: "Your favorite meals from trusted restaurants.", image: "/customer-services/food.webp", color: "orange", demo: false },
  { id: "DELIVERY", title: "Send a Package", description: "Reliable and quick deliveries across the city.", image: "/customer-services/delivery.webp", color: "blue", demo: false },
  { id: "ERRANDS", title: "Run Errandz", description: "A dedicated driver for shopping, pickups and personal errands.", image: "/customer-services/errandz.webp", color: "purple", demo: false },
  { id: "KIDDIE", title: "Kiddie Ridz", description: "Safe and reliable transportation for school children.", image: "/customer-services/kiddie.webp", color: "pink", demo: false },
] as const;

export function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
