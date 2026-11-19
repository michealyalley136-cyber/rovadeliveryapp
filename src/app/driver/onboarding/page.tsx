import { Onboarding } from "@/components/onboarding";
import { getSession } from "@/server/auth";

export default async function OperatorOnboardingPage() {
  const session = await getSession();
  return <Onboarding signedIn={session?.role === "OPERATOR"} />;
}
