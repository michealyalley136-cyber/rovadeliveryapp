import { HeroSlideshow } from "@/components/hero-slideshow";
import { cookies } from "next/headers";
import { isApplicationRecognized, recognitionCookieName } from "@/server/application-recognition";
import { getAdminSession } from "@/server/auth";

export default async function HomePage() {
  const cookieStore = await cookies();
  let recognized = false;
  try {
    recognized = await isApplicationRecognized(cookieStore.get(recognitionCookieName)?.value);
  } catch (error) {
    console.error("ROVA application recognition configuration error", error);
  }
  const admin = await getAdminSession();
  return <main className="home-screen"><HeroSlideshow showLogin={recognized || !!admin} /></main>;
}
