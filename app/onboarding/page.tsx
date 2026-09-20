import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

export const metadata = { title: "Get started | Cognito" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const { edit, new: fresh } = await searchParams;
  return <OnboardingFlow edit={edit === "1"} fresh={fresh === "1"} />;
}
