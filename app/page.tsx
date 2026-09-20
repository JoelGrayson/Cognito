import Link from "next/link";
import { Mascot } from "@/components/Mascot";
import { ModeSwitch } from "@/components/ModeSwitch";
import RoadmapPreview from "@/components/landing/RoadmapPreview";
import { ctaTarget, type LandingState } from "@/components/landing/cta-target";
import { getUserState } from "@/lib/plans";
import { getUserId } from "@/lib/session";
import { SUBJECTS } from "@/lib/subjects";
import { SubjectIcon, subjectColors } from "@/components/SubjectIcon";

// The CTA depends on per-user state, so this page must never be prerendered.
export const dynamic = "force-dynamic";

async function loadState(): Promise<LandingState | null> {
  try {
    const userId = await getUserId();
    return userId ? await getUserState(userId) : null;
  } catch (error) {
    console.error("landing: getUserState failed", error);
    return null;
  }
}

const PROBLEMS = [
  { q: "What should I learn?", a: "A map of the topics your goal actually needs, trimmed to what you already know." },
  { q: "In what order?", a: "Prerequisites come first, so you never hit a wall halfway through." },
  { q: "How long will it take?", a: "Time per topic and a weekly schedule that fits the hours you really have." },
];

const STEPS = [
  { title: "Tell us your goal", body: "Two quick screens: what you want to learn and what you already know." },
  { title: "Shape the map", body: "Chat with the AI or edit the graph yourself. Your edits always win." },
  { title: "Get your plan", body: "An ordered roadmap with a week-by-week schedule, ready to start." },
];

export default async function Home() {
  const cta = ctaTarget(await loadState());

  return (
    <div className="wb flex min-h-screen flex-col">
      <main className="flex-1">
        <section className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 pb-14 pt-8 sm:px-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-16 lg:pb-24 lg:pt-16">
          <div>
            <ModeSwitch mode="student" className="mb-6" />
            <h1 className="wb-serif text-4xl font-medium leading-[1.1] tracking-tight sm:text-5xl">
              Learn anything, in the right order.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-(--wb-muted)">
              Tell us your goal. Get a personal roadmap in under 3 minutes.
            </p>
            <div className="mt-8 flex flex-col items-start gap-3">
              <Link
                href={cta.href}
                className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-(--wb-primary) px-7 text-lg text-(--wb-card) shadow-[0_6px_24px_rgb(59_42_31/0.18)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-(--wb-primary) sm:w-auto"
              >
                {cta.label}
                <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10h11M11 5l5 5-5 5" />
                </svg>
              </Link>
              <p className="text-sm text-(--wb-muted)">No sign-up needed.</p>
            </div>
          </div>

          <div className="relative rounded-3xl border border-(--wb-line) bg-(--wb-card) p-4 shadow-[0_2px_10px_rgb(59_42_31/0.06)] sm:p-5">
            <div className="absolute -right-5 -top-9 hidden flex-row-reverse items-start gap-1 sm:flex">
              <Mascot size={72} />
              <span className="relative mt-3 rounded-2xl bg-(--wb-primary) px-4 py-2.5 text-[15px] text-(--wb-card) shadow-lg">
                What should we dig into today?
                <span className="absolute -right-1 bottom-3 h-3 w-3 rotate-45 rounded-[3px] bg-(--wb-primary)" />
              </span>
            </div>
            <RoadmapPreview className="mx-auto mt-4 h-auto w-full max-w-105" />
            <p className="mt-2 text-center text-xs text-(--wb-muted)">
              Example roadmap for &ldquo;Learn machine learning&rdquo;
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 pb-14 sm:px-8 lg:pb-20">
          <h2 className="wb-serif text-2xl font-medium tracking-tight sm:text-3xl">Your subjects</h2>
          <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SUBJECTS.map((subject) => {
              const { tint, ink } = subjectColors(subject.icon);
              return (
                <li
                  key={subject.id}
                  className="flex flex-col overflow-hidden rounded-3xl border border-(--wb-line) bg-(--wb-card) shadow-[0_2px_10px_rgb(59_42_31/0.06)]"
                >
                  <div className="flex items-center gap-4 px-6 py-5" style={{ background: tint, color: ink }}>
                    <SubjectIcon name={subject.icon} size={56} />
                    <div className="min-w-0">
                      <h3 className="wb-serif text-2xl">{subject.name}</h3>
                      <p className="truncate font-mono text-sm opacity-80">
                        {subject.sample[0]} <span aria-hidden="true">→</span> {subject.sample[1]}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <p className="flex-1 text-lg leading-snug">{subject.blurb}</p>
                    <p className="mt-2 text-sm text-(--wb-muted)">
                      {subject.checker === "algebra-steps"
                        ? "Steps checked as you write"
                        : subject.checker === "structure-key"
                          ? "Structures checked against the answer key"
                          : "Checking coming soon"}
                    </p>
                    <Link
                      href={`/dev/whiteboard?subject=${subject.id}`}
                      className="mt-5 inline-flex min-h-11 items-center self-start rounded-xl border border-(--wb-line) px-5 hover:bg-(--wb-hover) focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-(--wb-primary)"
                    >
                      Open {subject.name.toLowerCase()} whiteboard
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="problems" className="border-y border-(--wb-line) bg-(--wb-butter)/40">
          <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 lg:py-20">
            <h2 id="problems" className="wb-serif text-2xl font-medium tracking-tight sm:text-3xl">
              The three questions that stop self-learners
            </h2>
            <ul className="mt-8 grid gap-4 md:grid-cols-3">
              {PROBLEMS.map((item) => (
                <li key={item.q} className="rounded-3xl border border-(--wb-line) bg-(--wb-card) p-6">
                  <h3 className="wb-serif text-xl">{item.q}</h3>
                  <p className="mt-2 leading-relaxed text-(--wb-muted)">{item.a}</p>
                </li>
              ))}
            </ul>
            <p className="mt-6 max-w-2xl text-(--wb-muted)">
              Coming next: explaining topics back to an AI tutor and spaced review, to check that it actually stuck.
            </p>
          </div>
        </section>

        <section aria-labelledby="how" className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 lg:py-20">
          <h2 id="how" className="wb-serif text-2xl font-medium tracking-tight sm:text-3xl">
            How it works
          </h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-10 flex-none items-center justify-center rounded-full bg-(--wb-butter) font-medium text-(--wb-butter-ink)"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-lg font-medium">{step.title}</h3>
                  <p className="mt-1 leading-relaxed text-(--wb-muted)">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-(--wb-line) px-5 py-6 text-center text-sm text-(--wb-muted) sm:px-8">
        Built at HackMIT 2026
      </footer>
    </div>
  );
}
