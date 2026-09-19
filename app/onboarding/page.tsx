import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

export const metadata = { title: "Get started | StructuredLearning.ai" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const { edit } = await searchParams;
  return <OnboardingFlow edit={edit === "1"} />;
}
