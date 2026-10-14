/// <reference types="node" />
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LOOK_IDS, ON_HERO, paletteFor, type Palette } from "./theme.ts";

/* Every look, light and dark, must keep text readable: WCAG AA, 4.5 to 1. */

function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_ON: [keyof Palette, keyof Palette][] = [
  ["ink", "page"],
  ["muted", "page"],
  ["muted", "card"],
  ["inkSoft", "card"],
  ["accent", "card"],
  ["accent", "page"],
  ["accent", "accentTint"],
  ["inkSoft", "accentTint"],
  ["good", "card"],
  ["warn", "card"],
  ["bad", "card"],
  ["saved", "card"],
  ["offer", "card"],
  ["warnInk", "warnTint"],
  ["badInk", "badTint"],
  ["offerInk", "offerTint"],
  ["saved", "savedTint"],
  ["onAction", "action"],
  ["onHero", "hero"],
  ["onHeroSoft", "hero"],
  ["onHero", "heroOver"],
  ["onHeroSoft", "heroOver"],
  ["onChosen", "chosen"],
];

describe("colours", () => {
  for (const look of LOOK_IDS) {
    for (const scheme of ["light", "dark"] as const) {
      it(`${look}, ${scheme}: every text colour is readable on its background`, () => {
        const c = paletteFor(look, scheme);
        const failing = TEXT_ON.map(([fg, bg]) => ({ pair: `${fg} on ${bg}`, ratio: contrast(String(c[fg]), String(c[bg])) })).filter(
          (p) => p.ratio < 4.5,
        );
        assert.deepEqual(failing, []);
      });
    }
  }

  it("the pace chip on the Home card is readable in every state", () => {
    for (const tone of Object.values(ON_HERO)) assert.ok(contrast(tone.ink, tone.chip) >= 4.5);
  });

  it("a warning, a deal and the brand never share a colour", () => {
    for (const look of LOOK_IDS) {
      for (const scheme of ["light", "dark"] as const) {
        const c = paletteFor(look, scheme);
        const seen = new Set([c.warn, c.offer, c.accent, c.bad, c.good, c.saved]);
        assert.equal(seen.size, 6, `${look} ${scheme}`);
      }
    }
  });
});
