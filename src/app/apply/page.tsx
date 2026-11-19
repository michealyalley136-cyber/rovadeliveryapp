import { ApplyWizard } from "@/components/apply-wizard";
import { applicationTypes, isApplicationType } from "@/config/application-types";
import { featureFlags, isApplicationEnabled } from "@/server/feature-flags";

export default async function ApplyPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const params = await searchParams;
  const enabledTypes = applicationTypes.filter(isApplicationEnabled);
  return <ApplyWizard initialType={isApplicationType(params.type) ? params.type : null} applicationsEnabled={featureFlags.applicationsEnabled} disabledType={isApplicationType(params.type) && !isApplicationEnabled(params.type)} enabledTypes={enabledTypes} />;
}
