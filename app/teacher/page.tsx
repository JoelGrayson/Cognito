import type { Metadata } from "next";
import { ModeSwitch } from "@/components/ModeSwitch";
import { Grader } from "@/components/teacher/Grader";
import { Library } from "@/components/teacher/Library";
import { listProviders } from "@/lib/providers";

export const metadata: Metadata = { title: "Grade a class set · Cognito" };
export const dynamic = "force-dynamic";

export default async function TeacherPage() {
  return (
    <div className="wb flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-20 pt-8 sm:px-8 lg:pt-12">
        <ModeSwitch mode="teacher" />
        <h1 className="wb-serif mt-6 text-4xl font-medium leading-[1.1] tracking-tight sm:text-5xl">
          Grade the whole stack in minutes.
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-(--wb-muted)">
          Upload your students&rsquo; worksheets. Every page comes back marked in red pen, scored problem by problem, with
          the mistakes your class keeps making. You have the last word on every mark.
        </p>
        <Grader providers={await listProviders()} mock={process.env.MOCK_AI === "true"} />
        <Library />
      </main>
    </div>
  );
}
