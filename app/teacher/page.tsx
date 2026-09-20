import type { Metadata } from "next";
import { ModeSwitch } from "@/components/ModeSwitch";
import { HeroArt } from "@/components/teacher/HeroArt";
import { Grader } from "@/components/teacher/Grader";
import { Library } from "@/components/teacher/Library";
import { listProviders } from "@/lib/providers";

export const metadata: Metadata = { title: "Grade a class set · Cognito" };
export const dynamic = "force-dynamic";

const PERKS = [
  { label: "Red-pen marks on every page", tint: "#f9dcdc", ink: "#a23a2f" },
  { label: "A score for each problem", tint: "#e4f1e3", ink: "#2f6b3c" },
  { label: "What the class keeps missing", tint: "#dfeaf6", ink: "#3f6b9c" },
  { label: "Gradebook as a CSV", tint: "#e9e4f7", ink: "#5d4a9c" },
];

export default async function TeacherPage() {
  return (
    <div className="wb flex min-h-screen flex-col">
      <main className="flex-1">
        {/* The same hero frame as the student landing: the switch and the title stay put between modes. */}
        <section className="mx-auto grid w-full max-w-6xl items-start gap-14 px-5 pb-10 pt-8 sm:px-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-16 lg:pb-14 lg:pt-16">
          <div>
            <ModeSwitch mode="teacher" className="mb-6" />
            <h1 className="wb-serif text-4xl font-medium leading-[1.1] tracking-tight sm:text-5xl">
              Grade the whole stack <span className="whitespace-nowrap rounded-xl bg-(--wb-butter) px-2 text-(--wb-butter-ink)">in minutes.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-(--wb-muted)">
              Upload your students&rsquo; worksheets. Every page comes back marked in red pen, scored problem by problem,
              with the mistakes your class keeps making. You have the last word on every mark.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2 text-sm">
              {PERKS.map((perk) => (
                <li key={perk.label} className="rounded-full px-3.5 py-1.5" style={{ background: perk.tint, color: perk.ink }}>
                  {perk.label}
                </li>
              ))}
            </ul>
          </div>
          <HeroArt />
        </section>
        <div className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
          <Grader providers={await listProviders()} mock={process.env.MOCK_AI === "true"} />
          <Library />
        </div>
      </main>
    </div>
  );
}
