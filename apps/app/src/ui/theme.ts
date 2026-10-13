/*
 * Briv's look, taken from the agreed screens.
 * Green is for money you control, amber for offers, blue for savings and investments.
 */
export const color = {
  page: "#F3F4F0",
  card: "#FFFFFF",
  ink: "#17211C",
  inkSoft: "#3C4842",
  muted: "#5A665F",
  placeholder: "#9AA39D",
  line: "#E2E5DF",
  lineStrong: "#C9D3CC",
  rule: "#EEF0EC",
  green: "#1E5B43",
  greenDeep: "#15402F",
  greenTint: "#E3EFE8",
  greenOnDark: "#CFE3D8",
  amber: "#A14A12",
  amberTint: "#FBEBDD",
  amberInk: "#6B3A16",
  blue: "#2B5A8C",
  blueTint: "#E4ECF6",
  danger: "#A12A1E",
  dangerTint: "#F8E3E0",
  white: "#FFFFFF",
} as const;

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
