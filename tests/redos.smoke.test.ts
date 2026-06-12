import { describe, it, expect } from "vitest";
import { parseMarkdown } from "../src/utils/markdownParser";

// Guards against CodeQL js/polynomial-redos (alert #3): non-matching scans over
// delimiter-dense input must stay linear. These pumps made the old regexes
// backtrack quadratically; with unambiguous content classes they fail fast.
describe("inline-formatting regex scans stay linear on non-matching input", () => {
  const N = 50_000;
  const pumps: [string, string][] = [
    ["link text class", "[" + "[\\".repeat(N)],
    ["link url class", "[\\](" + "[(]((".repeat(N)],
    ["unclosed bold", "**" + "a".repeat(N)],
    ["unclosed underline", "__" + "a".repeat(N)],
    ["unclosed strikethrough", "~~" + "a~".repeat(N)],
  ];

  for (const [name, input] of pumps) {
    it(`${name} pump completes quickly`, () => {
      const started = Date.now();
      parseMarkdown(input);
      expect(Date.now() - started).toBeLessThan(1000);
    });
  }
});

// Looser guard for match-dense input: every pair below MATCHES, so the cost is
// dominated by doReplace's per-match string rebuild and range updates (known
// quadratic in match count), not regex backtracking. Catches only catastrophic
// regressions; tighten if doReplace ever gets a single-pass rewrite.
describe("match-dense inline formatting stays within bounds", () => {
  const N = 10_000;
  const pumps: [string, string][] = [
    ["bold italic ***", "***" + "***a".repeat(N)],
    ["bold **", "**" + "**a".repeat(N)],
    ["italic *", "*" + "*a".repeat(N)],
  ];

  for (const [name, input] of pumps) {
    it(`${name} pump completes within bounds`, () => {
      const started = Date.now();
      parseMarkdown(input);
      expect(Date.now() - started).toBeLessThan(2000);
    });
  }
});