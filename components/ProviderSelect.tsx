import type { ProviderId, ProviderInfo } from "@/lib/providers/types";

interface Props {
  providers: ProviderInfo[];
  value: ProviderId;
  onChange: (id: ProviderId) => void;
  disabled?: boolean;
}

/** Picks which AI provider generates the roadmap. Unconfigured ones are greyed out with a hint. */
export function ProviderSelect({ providers, value, onChange, disabled }: Props) {
  const current = providers.find((p) => p.id === value);
  return (
    <label className="inline-flex min-w-0 items-center gap-2 text-sm text-(--wb-muted)">
      <span>Model</span>
      <select
        className="min-w-0 cursor-pointer truncate rounded-xl bg-(--wb-hover) px-3 py-1.5 text-sm text-(--wb-ink) outline-none hover:bg-(--wb-line) focus:bg-(--wb-line) disabled:cursor-default disabled:opacity-60"
        value={value}
        disabled={disabled || providers.length === 0}
        onChange={(e) => onChange(e.target.value as ProviderId)}
        title={current && !current.configured ? current.hint : undefined}
      >
        {providers.length === 0 && <option value={value}>Loading…</option>}
        {providers.map((p) => (
          <option key={p.id} value={p.id} disabled={!p.configured} title={p.hint}>
            {p.label} · {p.model}
            {p.configured ? "" : " (not set up)"}
          </option>
        ))}
      </select>
    </label>
  );
}
