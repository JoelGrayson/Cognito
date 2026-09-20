const SYMBOLS: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ", theta: "θ",
  lambda: "λ", mu: "μ", pi: "π", sigma: "σ", omega: "ω", Omega: "Ω",
  infty: "∞", cdot: "·", times: "×", div: "÷", pm: "±", mp: "∓",
  le: "≤", leq: "≤", ge: "≥", geq: "≥", neq: "≠", approx: "≈",
  to: "→", rightarrow: "→", leftarrow: "←", Rightarrow: "⇒",
  sum: "∑", prod: "∏", int: "∫", partial: "∂", nabla: "∇",
  ldots: "…", cdots: "⋯", percent: "%", quad: " ", qquad: " ",
};
const SUPERSCRIPT: Record<string, string> = Object.fromEntries([..."0123456789+-=()"].map((c, i) => [c, [..."⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾"][i]]));
const SUBSCRIPT: Record<string, string> = Object.fromEntries([..."0123456789+-=()"].map((c, i) => [c, [..."₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎"][i]]));
const LATEX_COMMAND = new RegExp(String.raw`\\(?:[()[\]]|[a-zA-Z]+\s*\{|(?:${Object.keys(SYMBOLS).join("|")}|lim|sin|cos|tan|log|ln)\b)`);
const group = (s: string) => /^[\p{L}\p{N}.]+$/u.test(s.trim()) ? s.trim() : `(${s.trim()})`;

/** A display fallback for common model-emitted math, not a LaTeX renderer. */
function readableMath(text: string): string {
  let out = text.replace(/\\(?:left|right)\b/g, "");
  for (let pass = 0; pass < 16; pass++) {
    const previous = out;
    out = out
      .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g, "$1")
      .replace(/([_^])\s*\{([^{}]*)\}/g, (_, operator: string, value: string) => {
        const alphabet = operator === "^" ? SUPERSCRIPT : SUBSCRIPT;
        return [...value].every((c) => alphabet[c]) ? [...value].map((c) => alphabet[c]).join("") : `${operator}${group(value)}`;
      })
      .replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, numerator: string, denominator: string) => `${group(numerator)}/${group(denominator)}`)
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, (_, value: string) => `√${group(value)}`);
    if (out === previous) break;
  }
  return out
    .replace(/\\([a-zA-Z]+)/g, (_, name: string) => SYMBOLS[name] ?? name)
    .replace(/\\[,;!: ]/g, " ")
    .replace(/\\([{}%#$&_])/g, "$1")
    .replace(/([_^])([0-9])/g, (_, operator: string, digit: string) => (operator === "^" ? SUPERSCRIPT : SUBSCRIPT)[digit])
    .replace(/[{}]/g, "")
    .replace(/ {2,}/g, " ").trim();
}

/** Keep raw LaTeX out of tutor captions, chat, and whiteboard labels. */
export function plainVoiceText(text: string): string {
  const unwrapped = text
    .replace(/\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$/g, (_, inline: string, block: string, dollars: string) => readableMath(inline ?? block ?? dollars))
    // Preserve ordinary prices such as "$5 and $10".
    .replace(/\$(?!\d[\d,.]*(?:\s|$))([^$\n]+)\$/g, (_, math: string) => readableMath(math));
  return LATEX_COMMAND.test(unwrapped)
    ? readableMath(unwrapped).replace(/\\[()[\]]/g, "")
    : unwrapped;
}
