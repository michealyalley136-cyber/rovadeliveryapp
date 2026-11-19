import type { Metadata } from "next";
import socialImage from "@/images/ROVA Ghana_ Your Next Opportunity-9.png";
import "./globals.css";
import "./portal.css";
import "./marketing.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "ROVA Ghana | Move. Deliver. Earn.",
  description: "ROVA is building a new mobility and earning network connecting transportation, delivery, vehicle access and opportunity across Ghana.",
  applicationName: "ROVA Ghana",
  openGraph: {
    title: "ROVA Ghana | Move. Deliver. Earn.",
    description: "Ghana’s next mobility and earning network is being built.",
    type: "website",
    locale: "en_GH",
    images: [{ url: socialImage.src, width: socialImage.width, height: socialImage.height, alt: "ROVA Ghana — Move. Deliver. Earn." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ROVA Ghana | Move. Deliver. Earn.",
    description: "Ghana’s next mobility and earning network is being built.",
    images: [socialImage.src],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
