import { describe, expect, it } from "vitest";
import { plainVoiceText } from "./voice-text";

describe("plainVoiceText", () => {
  it("cleans the exact caption from the reported screenshot", () => {
    expect(plainVoiceText(String.raw`If we try to substitute \( x = 1 \), we get \( \frac{0}{0} \), which is undefined.`))
      .toBe("If we try to substitute x = 1, we get 0/0, which is undefined.");
  });
  it.each([
    [String.raw`\[\frac{x^{2}-1}{x-1}\]`, "(x²-1)/(x-1)"],
    [String.raw`$$\frac{\frac{x}{2}}{y + 1}$$`, "(x/2)/(y + 1)"],
    [String.raw`$\sqrt{x + 1} \leq \pi$`, "√(x + 1) ≤ π"],
    [String.raw`\(\lim_{x \to 1} f(x)\)`, "lim_(x → 1) f(x)"],
    [String.raw`\frac{1}{2}mv^{2}`, "1/2mv²"],
    [String.raw`\(x_{0} + \text{speed}\)`, "x₀ + speed"],
    [String.raw`\Delta x \approx 0`, "Δ x ≈ 0"],
  ])("converts %s to readable math", (input, output) => {
    expect(plainVoiceText(input)).toBe(output);
  });
  it("preserves prose, currency, and ordinary code escapes", () => {
    for (const text of ["Try x = 1.\nThen simplify.", "Prices are $5 and $10.", String.raw`Use \n for a newline.`, "F = ma", "Example: { x: 1 }"]) {
      expect(plainVoiceText(text)).toBe(text);
    }
  });
});
