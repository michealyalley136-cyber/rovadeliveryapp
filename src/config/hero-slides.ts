import type { StaticImageData } from "next/image";
import brandIntro from "@/images/Move. Deliver. Earn. With ROVA-1.png";
import brandNetwork from "@/images/Move, Deliver, Earn with ROVA Ghana-2.png";
import safeRides from "@/images/ROVA Ghana_ Safe, Reliable Rides-3.png";
import newOpportunities from "@/images/ROVA Ghana_ Safe Rides, New Opportunities-4.png";
import deliveryPartners from "@/images/ROVA Ghana_ Deliver More, Earn More-5.png";
import deliveryCommerce from "@/images/Deliver More, Grow with ROVA-6.png";
import serviceNetwork from "@/images/ROVA Ghana_ One Platform, Many Opportunities-7.png";
import vehicleAccess from "@/images/Your Journey to Earning Starts Here-8.png";
import applicationsOpen from "@/images/ROVA Ghana_ Your Next Opportunity-9.png";
import ghardwareMarketplace from "@/images/GHARDWARE-Ghana-Marketplace-Banner-10.png";

export type HeroSlide = {
  id: string;
  image: StaticImageData;
  alt: string;
  desktopPosition: string;
  mobilePosition: string;
  headline: string;
  ctaLabel: string;
  ctaHref: string;
  duration: number;
  enabled: boolean;
};

export const heroSlides: HeroSlide[] = [
  {
    id: "brand-introduction",
    image: brandIntro,
    alt: "ROVA Ghana campaign: Move. Deliver. Earn. With ROVA, featuring a Ghanaian motorcycle operator.",
    desktopPosition: "center 49%",
    mobilePosition: "center 48%",
    headline: "Move. Deliver. Earn. With ROVA.",
    ctaLabel: "Explore ROVA",
    ctaHref: "#about",
    duration: 6000,
    enabled: true,
  },
  {
    id: "safe-rides",
    image: safeRides,
    alt: "ROVA campaign featuring a passenger and motorcycle operator in Accra.",
    desktopPosition: "center 52%",
    mobilePosition: "center 48%",
    headline: "Safe rides. Reliable movement.",
    ctaLabel: "Explore rider opportunities",
    ctaHref: "/apply?type=MOTORCYCLE_RIDER",
    duration: 6000,
    enabled: true,
  },
  {
    id: "earning-opportunity",
    image: brandNetwork,
    alt: "ROVA Ghana motorcycle operator in branded safety gear.",
    desktopPosition: "center 48%",
    mobilePosition: "center 46%",
    headline: "Move. Deliver. Earn.",
    ctaLabel: "Become a rider",
    ctaHref: "/apply?type=MOTORCYCLE_RIDER",
    duration: 6000,
    enabled: true,
  },
  {
    id: "delivery",
    image: deliveryPartners,
    alt: "ROVA delivery operator with a branded delivery motorcycle and bag.",
    desktopPosition: "center 54%",
    mobilePosition: "center 48%",
    headline: "Deliver more. Earn more.",
    ctaLabel: "Apply for delivery",
    ctaHref: "/apply?type=DELIVERY_PARTNER",
    duration: 6000,
    enabled: true,
  },
  {
    id: "local-commerce",
    image: deliveryCommerce,
    alt: "ROVA delivery partner handing a restaurant order to a customer.",
    desktopPosition: "center 54%",
    mobilePosition: "center 48%",
    headline: "Deliver more. Grow with ROVA.",
    ctaLabel: "Join as a merchant",
    ctaHref: "/apply?type=MERCHANT",
    duration: 6000,
    enabled: true,
  },
  {
    id: "multiple-services",
    image: serviceNetwork,
    alt: "ROVA campaign showing ride, taxi, food, and delivery services together.",
    desktopPosition: "center 55%",
    mobilePosition: "center 50%",
    headline: "One platform. Many opportunities.",
    ctaLabel: "See all opportunities",
    ctaHref: "#opportunities",
    duration: 6000,
    enabled: true,
  },
  {
    id: "vehicle-access",
    image: vehicleAccess,
    alt: "ROVA operator receiving a motorcycle through a vehicle handover.",
    desktopPosition: "center 52%",
    mobilePosition: "center 49%",
    headline: "Your journey to earning starts here.",
    ctaLabel: "Explore vehicle access",
    ctaHref: "/apply?type=VEHICLE_ACCESS",
    duration: 6000,
    enabled: true,
  },
  {
    id: "network",
    image: newOpportunities,
    alt: "ROVA Ghana rider and passenger together, representing a connected local network.",
    desktopPosition: "center 51%",
    mobilePosition: "center 49%",
    headline: "Safe rides. New opportunities.",
    ctaLabel: "Join the network",
    ctaHref: "/apply",
    duration: 6000,
    enabled: true,
  },
  {
    id: "applications-open",
    image: applicationsOpen,
    alt: "ROVA Ghana rider, driver, and delivery team; applications are open for the pre-launch network.",
    desktopPosition: "center 52%",
    mobilePosition: "center 48%",
    headline: "Your next opportunity starts here.",
    ctaLabel: "Apply to ROVA",
    ctaHref: "/apply",
    duration: 6000,
    enabled: true,
  },
  {
    id: "ghardware-marketplace",
    image: ghardwareMarketplace,
    alt: "GHARDWARE Ghana marketplace: building materials, tools, and supplies delivery across Ghana through ROVA.",
    desktopPosition: "center 50%",
    mobilePosition: "center 48%",
    headline: "Building Ghana's future. Together.",
    ctaLabel: "Explore GHARDWARE",
    ctaHref: "https://ghardware.com",
    duration: 6000,
    enabled: true,
  },
];
