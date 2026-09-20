import { Mascot } from "@/components/Mascot";
import { SiteFooter } from "@/components/SiteFooter";
import { SpeechBubbleTail } from "@/components/SpeechBubbleTail";
import { WaitlistForm } from "./WaitlistForm";

export const metadata = {
  title: "Join the waitlist | Cognito",
  description: "A private tutor for everyone. Cognito checks your worksheet live as you write and gives hints, never the answer.",
};

const POINTS = [
  { title: "Write on your own worksheet", body: "Upload any PDF and work on it by hand, like paper." },
  { title: "Every step checked as you go", body: "A tick when it follows. A circle the moment it doesn't." },
  { title: "Hints, never the answer", body: "It asks why you did that step, the way a good tutor does." },
];

/** Rendered twice, one copy per breakpoint: beside the form on a wide screen, and
 *  BELOW it on a phone. Someone who scanned a QR code came to sign up, so the form has
 *  to be the first thing under the headline, not three paragraphs down. */
function Points({ className }: { className: string }) {
  return (
    <ul className={`flex-col gap-4 ${className}`}>
      {POINTS.map((point) => (
        <li key={point.title} className="flex gap-3">
          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-(--wb-good) text-(--wb-good-ink)">
            <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 10.5l4 4 8-9" />
            </svg>
          </span>
          <span>
            <span className="block font-medium">{point.title}</span>
            <span className="block text-(--wb-muted)">{point.body}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function WaitlistPage({ searchParams }: PageProps<"/waitlist">) {
  const { from } = await searchParams;
  const source = typeof from === "string" ? from.slice(0, 40) : null;

  return (
    <div className="wb flex min-h-screen flex-col">
      <main className="mx-auto grid w-full max-w-5xl flex-1 content-start items-start gap-8 px-5 py-8 sm:px-8 lg:grid-cols-2 lg:content-center lg:items-center lg:gap-16 lg:py-16">
        <div>
          <div className="mb-7 flex items-end gap-1">
            <span className="waitlist-bob">
              <Mascot size={88} />
            </span>
            <span className="relative mb-7 rounded-2xl bg-(--wb-primary) px-4 py-2.5 text-[15px] text-(--wb-card) drop-shadow-lg">
              Want a seat at the whiteboard?
              <SpeechBubbleTail side="left" />
            </span>
          </div>
          <h1 className="wb-serif text-4xl font-medium leading-[1.1] tracking-tight sm:text-5xl">
            A private tutor, for everyone.
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-(--wb-muted)">
            Cognito checks your worksheet live as you write, and gives you a hint when you slip. Never the answer.
          </p>
          <Points className="mt-8 hidden lg:flex" />
        </div>

        <div className="rounded-3xl border border-(--wb-line) bg-(--wb-card) p-6 shadow-[0_2px_10px_rgb(59_42_31/0.06)] sm:p-8">
          <h2 className="wb-serif mb-1 text-2xl font-medium">Join the waitlist</h2>
          <p className="mb-6 text-(--wb-muted)">Be first to try it.</p>
          <WaitlistForm source={source} />
        </div>
        <Points className="flex lg:hidden" />
      </main>
      <SiteFooter />
    </div>
  );
}
