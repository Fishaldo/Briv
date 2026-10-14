import { createContext, useContext, useMemo } from "react";

/*
 * Briv's colours, by what they mean rather than what they look like.
 *
 * Two kinds of colour, kept apart:
 *  - the brand: the Home card, the main buttons, links. It says "this is Briv"
 *    and nothing about how the person is doing.
 *  - status: good (on track), warn (watch it), bad (over), saved (put away),
 *    offer (a deal). These never borrow the brand colour, so a deal never
 *    looks like a warning and overspending never looks like "all good".
 *
 * Every colour has a light and a dark value; the phone's setting picks one,
 * unless the person chose Light or Dark in Settings.
 */

export type Scheme = "light" | "dark";
export type LookId = "forest" | "emerald" | "coral";

export type Palette = {
  scheme: Scheme;
  page: string;
  card: string;
  ink: string;
  inkSoft: string;
  muted: string;
  placeholder: string;
  line: string;
  lineStrong: string;
  rule: string;
  /** The Home card. */
  hero: string;
  /** The Home card when spending is over take-home. */
  heroOver: string;
  onHero: string;
  onHeroSoft: string;
  heroTrack: string;
  heroChip: string;
  /** Main buttons, the raised Add button, switches. */
  action: string;
  onAction: string;
  /** Links and small brand marks on the page. */
  accent: string;
  accentTint: string;
  good: string;
  goodTint: string;
  warn: string;
  warnTint: string;
  warnInk: string;
  bad: string;
  badTint: string;
  badInk: string;
  saved: string;
  savedTint: string;
  offer: string;
  offerTint: string;
  offerInk: string;
  /** A chosen chip. */
  chosen: string;
  onChosen: string;
};

type Neutrals = Pick<Palette, "page" | "card" | "ink" | "inkSoft" | "muted" | "placeholder" | "line" | "lineStrong" | "rule" | "chosen" | "onChosen">;
type Status = Pick<
  Palette,
  "good" | "goodTint" | "warn" | "warnTint" | "warnInk" | "bad" | "badTint" | "badInk" | "saved" | "savedTint" | "offer" | "offerTint" | "offerInk" | "heroOver"
>;
type Brand = Pick<Palette, "hero" | "onHero" | "onHeroSoft" | "heroTrack" | "heroChip" | "action" | "onAction" | "accent" | "accentTint">;

const NEUTRALS: Record<Scheme, Neutrals> = {
  light: {
    page: "#F3F4F0",
    card: "#FFFFFF",
    ink: "#17211C",
    inkSoft: "#3C4842",
    muted: "#5A665F",
    placeholder: "#8A948E",
    line: "#E2E5DF",
    lineStrong: "#C9D3CC",
    rule: "#EEF0EC",
    chosen: "#17211C",
    onChosen: "#FFFFFF",
  },
  dark: {
    page: "#0E1311",
    card: "#171E1B",
    ink: "#ECF1EE",
    inkSoft: "#C6CFCA",
    muted: "#9BA6A0",
    placeholder: "#6C7872",
    line: "#252E2A",
    lineStrong: "#3A4641",
    rule: "#1E2623",
    chosen: "#ECF1EE",
    onChosen: "#0E1311",
  },
};

const STATUS: Record<Scheme, Status> = {
  light: {
    good: "#1A7346",
    goodTint: "#E1F2E8",
    warn: "#93560A",
    warnTint: "#FBEFD9",
    warnInk: "#6A3E06",
    bad: "#B3261E",
    badTint: "#FBE6E3",
    badInk: "#7D1B14",
    saved: "#2B5A8C",
    savedTint: "#E4ECF6",
    offer: "#7B3FA0",
    offerTint: "#F2E8F8",
    offerInk: "#542A6E",
    heroOver: "#8E1F17",
  },
  dark: {
    good: "#6FD3A0",
    goodTint: "#163126",
    warn: "#F0B65A",
    warnTint: "#33270F",
    warnInk: "#F6D49C",
    bad: "#FF8E80",
    badTint: "#3A1916",
    badInk: "#FFC4BB",
    saved: "#8DB8EA",
    savedTint: "#162839",
    offer: "#D5A8F0",
    offerTint: "#2B1D36",
    offerInk: "#EAD2F8",
    heroOver: "#6E1A14",
  },
};

/**
 * The three looks being compared. "forest" is the one in use; the others are
 * candidates until the final name and logo are chosen.
 */
const LOOKS: Record<LookId, Record<Scheme, Brand>> = {
  forest: {
    light: {
      hero: "#1E5B43",
      onHero: "#FFFFFF",
      onHeroSoft: "#CFE3D8",
      heroTrack: "rgba(255,255,255,0.2)",
      heroChip: "rgba(255,255,255,0.14)",
      action: "#1E5B43",
      onAction: "#FFFFFF",
      accent: "#1E5B43",
      accentTint: "#E3EFE8",
    },
    dark: {
      hero: "#1B4A38",
      onHero: "#FFFFFF",
      onHeroSoft: "#C3DDCF",
      heroTrack: "rgba(255,255,255,0.18)",
      heroChip: "rgba(255,255,255,0.12)",
      action: "#7FCCA6",
      onAction: "#0C1F17",
      accent: "#86D2AC",
      accentTint: "#173328",
    },
  },
  emerald: {
    light: {
      hero: "#007A52",
      onHero: "#FFFFFF",
      onHeroSoft: "#D3F2E3",
      heroTrack: "rgba(255,255,255,0.24)",
      heroChip: "rgba(255,255,255,0.16)",
      action: "#007A52",
      onAction: "#FFFFFF",
      accent: "#00704B",
      accentTint: "#DCF4E8",
    },
    dark: {
      hero: "#00694A",
      onHero: "#FFFFFF",
      onHeroSoft: "#C9EFDD",
      heroTrack: "rgba(255,255,255,0.2)",
      heroChip: "rgba(255,255,255,0.14)",
      action: "#3DDC97",
      onAction: "#04241A",
      accent: "#4FE0A2",
      accentTint: "#0F3426",
    },
  },
  coral: {
    light: {
      hero: "#211F33",
      onHero: "#FFFFFF",
      onHeroSoft: "#CFCCE3",
      heroTrack: "rgba(255,255,255,0.18)",
      heroChip: "rgba(255,255,255,0.12)",
      action: "#CC4126",
      onAction: "#FFFFFF",
      accent: "#BF3E24",
      accentTint: "#FCE8E2",
    },
    dark: {
      hero: "#26233B",
      onHero: "#FFFFFF",
      onHeroSoft: "#CBC7E2",
      heroTrack: "rgba(255,255,255,0.18)",
      heroChip: "rgba(255,255,255,0.12)",
      action: "#FF7A5C",
      onAction: "#2A0E07",
      accent: "#FF8C70",
      accentTint: "#3A1C15",
    },
  },
};

export const LOOK_IDS = Object.keys(LOOKS) as LookId[];

export function isLook(value: unknown): value is LookId {
  return typeof value === "string" && value in LOOKS;
}

export function paletteFor(look: LookId, scheme: Scheme): Palette {
  return { scheme, ...NEUTRALS[scheme], ...STATUS[scheme], ...LOOKS[look][scheme] };
}

/**
 * The Home card's progress and pace chip, in status colours that read on any
 * brand colour, light or dark.
 */
export const ON_HERO = {
  good: { chip: "#DDF3E6", ink: "#0F5132", fill: "#FFFFFF" },
  warn: { chip: "#FCE7C2", ink: "#6A3E06", fill: "#F6C35B" },
  bad: { chip: "#FFD9D3", ink: "#7D1B14", fill: "#FF9A8A" },
} as const;

export const ThemeContext = createContext<Palette>(paletteFor("forest", "light"));

/** The colours for this screen, light or dark. */
export function useColors(): Palette {
  return useContext(ThemeContext);
}

/**
 * Styles that follow the colours: `const useStyles = makeStyles((c) => ({ … }))`
 * at the top of a file, then `const styles = useStyles()` in the component.
 */
export function makeStyles<T>(build: (c: Palette) => T): () => T {
  const made = new WeakMap<Palette, T>();
  return function useStyles() {
    const c = useColors();
    return useMemo(() => {
      const hit = made.get(c);
      if (hit) return hit;
      const styles = build(c);
      made.set(c, styles);
      return styles;
    }, [c]);
  };
}

export const font = {
  regular: "Manrope_400Regular",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
  heavy: "Manrope_800ExtraBold",
} as const;

export const radius = { chip: 999, field: 14, button: 16, card: 18, hero: 22 } as const;

export const space = { gutter: 20, gap: 16, tight: 8 } as const;

/** Touch targets are never smaller than this. */
export const touch = 44;

/** The widest a column of content grows on a tablet or the website. */
export const maxWidth = 560;
