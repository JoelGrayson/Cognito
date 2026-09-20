"use client";

import type { ReactNode } from "react";
import { DefaultColorStyle, DefaultSizeStyle, useValue, type Editor } from "tldraw";
import type { SavedSheet } from "@/lib/whiteboard/library";
import type { SubjectPanel } from "@/lib/subjects";
import type { Mastery } from "@/lib/whiteboard/mastery";

const ICONS = {
  pen: ["M12 20h9", "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"],
  highlighter: ["m9 11-6 6v3h9l3-3", "m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"],
  eraser: [
    "m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21",
    "M22 21H7",
    "m5 11 9 9",
  ],
  undo: ["M3 7v6h6", "M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"],
  redo: ["M21 7v6h-6", "M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"],
  mic: ["M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z", "M19 10v2a7 7 0 0 1-14 0v-2", "M12 19v3"],
  volume: [
    "M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6a1.4 1.4 0 0 1-1 .4H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5Z",
    "M16 9a5 5 0 0 1 0 6",
  ],
  mute: [
    "M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6a1.4 1.4 0 0 1-1 .4H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5Z",
    "m22 9-6 6",
    "m16 9 6 6",
  ],
  trash: ["M3 6h18", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"],
  sliders: ["M4 21v-7", "M4 10V3", "M12 21v-9", "M12 8V3", "M20 21v-5", "M20 12V3", "M2 14h4", "M10 8h4", "M18 16h4"],
  upload: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m17 8-5-5-5 5", "M12 3v12"],
  x: ["M18 6 6 18", "m6 6 12 12"],
  plus: ["M5 12h14", "M12 5v14"],
  folder: [
    "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.6 3.9A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
  ],
  check: ["M20 6 9 17l-5-5"],
  graph: ["M3 3v16a2 2 0 0 0 2 2h16", "m19 9-5 5-4-4-3 3"],
  award: ["M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z", "m9 14-1.5 7L12 18.5l4.5 2.5L15 14"],
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICONS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** Red is left out on purpose: it is the tutor's pen. */
export const PEN_COLORS = [
  ["black", "bg-neutral-900"],
  ["blue", "bg-blue-600"],
  ["green", "bg-emerald-600"],
] as const;
export type PenColor = (typeof PEN_COLORS)[number][0];
/** tldraw size token -> dot diameter (px) for the picker. */
export const PEN_SIZES = [
  ["s", 4],
  ["m", 7],
  ["l", 11],
  ["xl", 15],
] as const;
export type PenSize = (typeof PEN_SIZES)[number][0];

const TOOLS = [
  ["draw", "pen", "Pen"],
  ["highlight", "highlighter", "Highlighter"],
  ["eraser", "eraser", "Eraser"],
] as const;

function DockButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-30 ${
        active ? "bg-(--wb-primary) text-(--wb-card)" : "text-(--wb-ink) hover:bg-(--wb-hover)"
      }`}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-0.5 hidden h-6 w-px shrink-0 bg-(--wb-line) sm:block" />;

/** Replaces tldraw's toolbar: the same three tools and undo, plus the tutor's controls,
 *  so everything the learner touches while writing sits in one place. */
export function Dock({
  editor,
  penColor,
  onPenColor,
  penSize,
  onPenSize,
  voiceOn,
  onVoiceOn,
  listening,
  onTalkStart,
  onTalkEnd,
  onReset,
}: {
  editor: Editor | null;
  penColor: PenColor;
  onPenColor: (color: PenColor) => void;
  penSize: PenSize;
  onPenSize: (size: PenSize) => void;
  voiceOn: boolean;
  onVoiceOn: (on: boolean) => void;
  listening: boolean;
  onTalkStart: () => void;
  onTalkEnd: () => void;
  onReset: () => void;
}) {
  const tool = useValue("tool", () => editor?.getCurrentToolId() ?? "draw", [editor]);
  const canUndo = useValue("canUndo", () => editor?.getCanUndo() ?? false, [editor]);
  const canRedo = useValue("canRedo", () => editor?.getCanRedo() ?? false, [editor]);

  return (
    <div className="flex max-w-full flex-wrap items-center justify-center gap-y-1 rounded-3xl border border-(--wb-line) bg-(--wb-card) p-1.5 sm:flex-nowrap sm:rounded-full shadow-[0_6px_24px_rgb(59_42_31/0.12)]">
      {TOOLS.map(([id, icon, label]) => (
        <DockButton key={id} label={label} active={tool === id} onClick={() => editor?.setCurrentTool(id)}>
          <Icon name={icon} />
        </DockButton>
      ))}
      <Divider />
      <div className="flex items-center gap-1.5 px-1.5" role="radiogroup" aria-label="Pen colour">
        {PEN_COLORS.map(([color, swatch]) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={penColor === color}
            aria-label={color}
            onClick={() => {
              onPenColor(color);
              editor?.setStyleForNextShapes(DefaultColorStyle, color);
              editor?.setCurrentTool("draw");
            }}
            className={`h-6 w-6 shrink-0 rounded-full ${swatch} ${
              penColor === color ? "ring-2 ring-(--wb-primary) ring-offset-2 ring-offset-(--wb-card)" : ""
            }`}
          />
        ))}
      </div>
      <Divider />
      <div className="flex items-center" role="radiogroup" aria-label="Pen thickness">
        {PEN_SIZES.map(([size, px]) => (
          <button
            key={size}
            type="button"
            role="radio"
            aria-checked={penSize === size}
            aria-label={`Thickness ${size}`}
            title={`Thickness ${size}`}
            onClick={() => {
              onPenSize(size);
              editor?.setStyleForNextShapes(DefaultSizeStyle, size);
              editor?.setCurrentTool("draw");
            }}
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
              penSize === size ? "bg-(--wb-butter)" : "hover:bg-(--wb-hover)"
            }`}
          >
            <span className="block rounded-full bg-(--wb-ink)" style={{ width: px, height: px }} />
          </button>
        ))}
      </div>
      <Divider />
      <DockButton label="Undo" disabled={!canUndo} onClick={() => editor?.undo()}>
        <Icon name="undo" />
      </DockButton>
      <DockButton label="Redo" disabled={!canRedo} onClick={() => editor?.redo()}>
        <Icon name="redo" />
      </DockButton>
      <Divider />
      <button
        type="button"
        aria-label={listening ? "Listening" : "Hold to talk, or hold space"}
        title="Hold to talk, or hold space"
        onMouseDown={onTalkStart}
        onMouseUp={onTalkEnd}
        onMouseLeave={onTalkEnd}
        onTouchStart={(e) => {
          e.preventDefault();
          onTalkStart();
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          onTalkEnd();
        }}
        className={`grid h-9 w-9 shrink-0 select-none place-items-center rounded-full transition-colors ${
          listening ? "wb-listening bg-[#d9534f] text-white" : "bg-(--wb-blush) text-(--wb-bad-ink)"
        }`}
      >
        <Icon name="mic" />
      </button>
      <DockButton label={voiceOn ? "Mute the tutor" : "Unmute the tutor"} onClick={() => onVoiceOn(!voiceOn)}>
        <Icon name={voiceOn ? "volume" : "mute"} />
      </DockButton>
      <DockButton label="Clear my writing" onClick={onReset}>
        <Icon name="trash" />
      </DockButton>
    </div>
  );
}

/** What the tutor last said, with the tail pointing left at the mascot. */
export function TutorBubble({ text, onDismiss }: { text: string; onDismiss?: () => void }) {
  return (
    <div className="wb-pop relative w-fit max-w-full rounded-2xl bg-(--wb-primary) px-4 py-3 text-[15px] leading-snug text-(--wb-card)">
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full border border-(--wb-line) bg-(--wb-card) text-(--wb-muted)"
        >
          <Icon name="x" size={12} />
        </button>
      )}
      {text}
      <span className="absolute -left-1.5 top-4 h-3.5 w-3.5 rotate-45 rounded-[3px] bg-(--wb-primary)" />
    </div>
  );
}

export function Tag({ tone, children }: { tone: "good" | "bad" | "butter" | "quiet"; children: ReactNode }) {
  const tones = {
    good: "bg-(--wb-good) text-(--wb-good-ink)",
    bad: "bg-(--wb-bad) text-(--wb-bad-ink)",
    butter: "bg-(--wb-butter) text-(--wb-butter-ink)",
    quiet: "bg-(--wb-hover) text-(--wb-muted)",
  };
  return (
    <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${tones[tone]}`}>
      {children}
    </span>
  );
}

function SheetTile({
  title,
  caption,
  current = false,
  onOpen,
  onDelete,
  children,
}: {
  title: string;
  caption: string;
  current?: boolean;
  onOpen: () => void;
  onDelete?: () => void;
  children: ReactNode;
}) {
  return (
    <li className="relative">
      <button type="button" onClick={onOpen} className="group block w-full text-left">
        <span
          className={`grid aspect-[3/4] place-items-center overflow-hidden rounded-2xl border bg-(--wb-card) shadow-[0_2px_10px_rgb(59_42_31/0.08)] transition-transform group-hover:-translate-y-0.5 ${
            current ? "border-(--wb-primary) ring-2 ring-(--wb-primary)" : "border-(--wb-line)"
          }`}
        >
          {children}
        </span>
        <span className="mt-2 block truncate text-sm">{title}</span>
        <span className="block text-xs text-(--wb-muted)">{caption}</span>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${title}`}
          className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full border border-(--wb-line) bg-(--wb-card) text-(--wb-muted) shadow-sm hover:text-(--wb-bad-ink)"
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </li>
  );
}

const DAY = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** Every sheet uploaded from this browser, as a shelf of covers. */
export function Library({
  sheets,
  currentId,
  busy,
  onClose,
  onUpload,
  onBlank,
  onSample,
  sample,
  onOpen,
  onDelete,
}: {
  sheets: SavedSheet[];
  currentId: string | null;
  busy: boolean;
  onClose: () => void;
  onUpload: () => void;
  onBlank: () => void;
  onSample: () => void;
  sample: { file: string; title: string; caption: string };
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    /* A docked panel beside the canvas on desktop; on a phone there is no room beside
       it, so it covers the screen instead. */
    <div
      className={PANEL_SHELL}
      aria-busy={busy}
    >
      <div className="px-5 py-5">
        <div className="flex items-center justify-between">
          <h2 className="wb-serif text-xl">My worksheets</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-(--wb-hover)"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <p className="mt-0.5 text-sm text-(--wb-muted)">Pick one to write on, or start something new.</p>

        <ul
          className={`mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-2 ${
            busy ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <SheetTile title="Upload" caption="PDF or photo" onOpen={onUpload}>
            <span className="grid h-full w-full place-items-center border-2 border-dashed border-(--wb-line) bg-(--wb-hover)">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-(--wb-primary) text-(--wb-card)">
                <Icon name="plus" />
              </span>
            </span>
          </SheetTile>
          <SheetTile title="Blank board" caption="Just a page" current={currentId === null} onOpen={onBlank}>
            <span className="text-(--wb-muted)">
              <Icon name="pen" size={28} />
            </span>
          </SheetTile>
          {sheets.map((sheet) => (
            <SheetTile
              key={sheet.id}
              title={sheet.name}
              caption={`${sheet.pages} ${sheet.pages === 1 ? "page" : "pages"} · ${DAY.format(sheet.openedAt)}`}
              current={sheet.id === currentId}
              onOpen={() => onOpen(sheet.id)}
              onDelete={() => onDelete(sheet.id)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a data URL from IndexedDB */}
              <img src={sheet.thumb} alt="" className="h-full w-full object-cover object-top" />
            </SheetTile>
          ))}
          {!sheets.some((sheet) => sheet.name === sample.file) && (
            <SheetTile title={sample.title} caption={sample.caption} onOpen={onSample}>
              <Tag tone="butter">Sample</Tag>
            </SheetTile>
          )}
        </ul>
      </div>
    </div>
  );
}

function RailButton({
  label,
  active = false,
  dot = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  /** Something is in this panel that the learner has not looked at. */
  dot?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl border transition-colors ${
        active
          ? "border-(--wb-primary) bg-(--wb-primary) text-(--wb-card)"
          : "border-(--wb-line) bg-(--wb-card) text-(--wb-ink) hover:bg-(--wb-hover)"
      }`}
    >
      {children}
      {dot && (
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#c74440] ring-2 ring-(--wb-card)" />
      )}
    </button>
  );
}

const PANEL_SHELL =
  "wb wb-pop fixed inset-0 z-[500] overflow-y-auto xl:static xl:z-auto xl:w-80 xl:shrink-0 xl:rounded-3xl xl:border xl:border-(--wb-line) xl:bg-(--wb-card)";

const STATE_TAG = {
  "not-started": ["quiet", "Not started"],
  "in-progress": ["butter", "In progress"],
  "needs-a-look": ["bad", "Needs a look"],
  "on-track": ["good", "On track"],
} as const;

const STEP_DOT = {
  followed: "bg-(--wb-good-ink)",
  flagged: "bg-[#d9534f]",
  unjudged: "bg-(--wb-line)",
} as const;

/** Progress per problem, one dot per written step. */
export function MasteryPanel({ mastery, onClose }: { mastery: Mastery; onClose: () => void }) {
  return (
    <div className={PANEL_SHELL}>
      <div className="px-5 py-5">
        <div className="flex items-center justify-between">
          <h2 className="wb-serif text-xl">Mastery</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-(--wb-hover)"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <p className="mt-4 text-[11px] font-medium uppercase tracking-widest text-(--wb-muted)">This session</p>
        <div className="mt-2 flex items-center gap-3">
          <div
            role="progressbar"
            aria-label="Problems on track"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={mastery.percent}
            className="h-2 flex-1 overflow-hidden rounded-full bg-(--wb-butter)"
          >
            <div className="h-full rounded-full bg-(--wb-primary) transition-[width] duration-300" style={{ width: `${mastery.percent}%` }} />
          </div>
          <span className="w-10 text-right text-sm tabular-nums">{mastery.percent}%</span>
        </div>

        <ul className="mt-5 space-y-2.5">
          {mastery.problems.map((problem) => {
            const [tone, label] = STATE_TAG[problem.state];
            return (
              <li key={problem.id ?? "loose"} className="rounded-2xl border border-(--wb-line) p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span>{problem.label}</span>
                  <Tag tone={tone}>{label}</Tag>
                </div>
                <div className="mt-2.5 flex min-h-3 flex-wrap gap-1.5" aria-label={`${problem.steps.length} steps written`}>
                  {problem.steps.map((mark, i) => (
                    <span key={i} title={mark} className={`h-3 w-3 rounded-full ${STEP_DOT[mark]}`} />
                  ))}
                  {problem.steps.length === 0 && <span className="text-xs text-(--wb-muted)">No steps yet</span>}
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-5 text-xs leading-relaxed text-(--wb-muted)">
          One dot per step: green follows, red needs another look, grey has not been judged. This resets when you
          leave the page.
        </p>
      </div>
    </div>
  );
}

/** What opens beside the canvas, for the panels this subject has. */
export function Rail({
  panels,
  open,
  graphed = false,
  onToggle,
}: {
  panels: readonly SubjectPanel[];
  open: SubjectPanel | null;
  /** The tutor has drawn something in the graph panel. */
  graphed?: boolean;
  onToggle: (panel: SubjectPanel) => void;
}) {
  return (
    <nav aria-label="Whiteboard panels" className="flex shrink-0 gap-2 lg:flex-col lg:justify-end">
      {panels.includes("worksheets") && (
        <RailButton label="My worksheets" active={open === "worksheets"} onClick={() => onToggle("worksheets")}>
          <Icon name="folder" size={22} />
        </RailButton>
      )}
      {panels.includes("mastery") && (
        <RailButton label="Mastery" active={open === "mastery"} onClick={() => onToggle("mastery")}>
          <Icon name="award" size={22} />
        </RailButton>
      )}
      {panels.includes("graphs") && (
        <RailButton label="Graph" active={open === "graphs"} dot={graphed} onClick={() => onToggle("graphs")}>
          <Icon name="graph" size={22} />
        </RailButton>
      )}
    </nav>
  );
}
