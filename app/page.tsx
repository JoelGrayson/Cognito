import Link from "next/link";
import RoadmapPreview from "@/components/landing/RoadmapPreview";
import { ctaTarget, type LandingState } from "@/components/landing/cta-target";
import { getUserState } from "@/lib/plans";
import { getUserId } from "@/lib/session";

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
    <div className="flex min-h-screen flex-col bg-white text-(--fg)">
      <header className="mx-auto flex w-full max-w-6xl items-center px-5 py-5 sm:px-8">
        <span className="text-base font-semibold tracking-tight">StructuredLearning.ai</span>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-14 pt-6 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16 lg:pb-24 lg:pt-14">
          <div>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              Know what to learn, in what order, and for how long.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-neutral-600">
              Most self-learners stall because nobody hands them a plan. Tell us your goal and get a personalized,
              editable roadmap in under 3 minutes.
            </p>
            <div className="mt-8 flex flex-col items-start gap-3">
              <Link
                href={cta.href}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent-strong px-8 text-lg font-semibold text-white transition-colors hover:bg-[#2f47c4] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent-strong sm:w-auto"
              >
                {cta.label}
                <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10h11M11 5l5 5-5 5" />
                </svg>
              </Link>
              <p className="text-sm text-neutral-600">No sign-up needed.</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#e4e3de] bg-(--panel) p-4 sm:p-6">
            <RoadmapPreview className="mx-auto h-auto w-full max-w-105" />
            <p className="mt-2 text-center text-xs text-neutral-600">
              Example roadmap for &ldquo;Learn machine learning&rdquo;
            </p>
          </div>
        </section>

        <section aria-labelledby="problems" className="border-t border-[#ecebe7] bg-(--panel)">
          <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 lg:py-20">
            <h2 id="problems" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              The three questions that stop self-learners
            </h2>
            <ul className="mt-8 grid gap-4 md:grid-cols-3">
              {PROBLEMS.map((item) => (
                <li key={item.q} className="rounded-xl border border-[#e4e3de] bg-white p-5">
                  <h3 className="text-lg font-semibold">{item.q}</h3>
                  <p className="mt-2 leading-relaxed text-neutral-600">{item.a}</p>
                </li>
              ))}
            </ul>
            <p className="mt-6 max-w-2xl text-neutral-600">
              Coming next: explaining topics back to an AI tutor and spaced review, to check that it actually stuck.
            </p>
          </div>
        </section>

        <section aria-labelledby="how" className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 lg:py-20">
          <h2 id="how" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            How it works
          </h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-9 flex-none items-center justify-center rounded-full bg-[#ecebfb] font-semibold text-[#3b3499]"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="mt-1 leading-relaxed text-neutral-600">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-[#ecebe7] px-5 py-6 text-center text-sm text-neutral-600 sm:px-8">
        Built at HackMIT 2026
      </footer>
    </div>
  );
}
