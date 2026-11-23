import { NextResponse } from "next/server";
import { getSession } from "@/server/auth";
import { getHeritageRotation } from "@/server/heritage-settings";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "CUSTOMER") {
    return NextResponse.json({ error: "Customer sign-in is required." }, { status: 401 });
  }
  try {
    return NextResponse.json(await getHeritageRotation(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("ROVA heritage settings refresh failed", error);
    return NextResponse.json({ error: "Heritage settings could not be refreshed." }, { status: 503 });
  }
}
