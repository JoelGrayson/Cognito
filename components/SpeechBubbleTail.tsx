/** The base overlaps the bubble by 4px so rounded edges never leave a seam. */
export function SpeechBubbleTail({ side = "left" }: { side?: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 14 16"
      className={`pointer-events-none absolute h-4 w-3.5 fill-(--wb-primary) ${
        side === "left" ? "-left-2.5 top-4" : "-right-2.5 top-1/2 -translate-y-1/2 rotate-180"
      }`}
    >
      <path d="M14 0 1.5 6.3Q0 8 1.5 9.7L14 16Z" />
    </svg>
  );
}
