/**
 * Design tokens. Navy primary + gold accent, quiet neutrals, and leave-state colours tuned
 * for WCAG AA text contrast in both colour schemes.
 */
export const brand = {
  navy: "#1F3A5F",
  navyDark: "#142842",
  navyLight: "#3B5B85",
  gold: "#B8860B",
  goldLight: "#E0B54A",
};

export interface LeavePalette {
  available: string;
  availableText: string;
  selected: string;
  selectedText: string;
  range: string;
  planned: string;
  plannedText: string;
  pending: string;
  pendingText: string;
  approved: string;
  approvedText: string;
  full: string;
  fullText: string;
  restricted: string;
  restrictedText: string;
  holiday: string;
  holidayAccent: string;
  weekend: string;
  today: string;
}

export interface SidebarPalette {
  bg: string;
  text: string;
  muted: string;
  hover: string;
  active: string;
  accent: string;
  border: string;
}

export const leaveLight: LeavePalette = {
  available: "#F1F8F4",
  availableText: "#1D4D33",
  selected: brand.navy,
  selectedText: "#FFFFFF",
  range: "#DCE7F5",
  planned: "#DCEAF8",
  plannedText: "#173A63",
  pending: "#FDF0CC",
  pendingText: "#6B4A00",
  approved: "#2F7D52",
  approvedText: "#FFFFFF",
  full: "#FBE3E3",
  fullText: "#8A1F1F",
  restricted: "#EDEFF3",
  restrictedText: "#667085",
  holiday: "#F4ECFB",
  holidayAccent: "#8E44C9",
  weekend: "#F8F9FB",
  today: brand.gold,
};

export const leaveDark: LeavePalette = {
  available: "#15251C",
  availableText: "#A9DDBD",
  selected: "#8FB3E3",
  selectedText: "#0B1320",
  range: "#1F3047",
  planned: "#1C3150",
  plannedText: "#C4DAF5",
  pending: "#3B3016",
  pendingText: "#F3D58A",
  approved: "#3E9B66",
  approvedText: "#FFFFFF",
  full: "#3A1D21",
  fullText: "#F4B4B4",
  restricted: "#1B2330",
  restrictedText: "#8C97A8",
  holiday: "#2A1E38",
  holidayAccent: "#C79BEF",
  weekend: "#111925",
  today: brand.goldLight,
};

export const sidebarLight: SidebarPalette = {
  bg: "#16273F",
  text: "#E7ECF3",
  muted: "rgba(231,236,243,0.56)",
  hover: "rgba(255,255,255,0.07)",
  active: "rgba(255,255,255,0.12)",
  accent: brand.goldLight,
  border: "rgba(255,255,255,0.08)",
};

export const sidebarDark: SidebarPalette = {
  bg: "#0B1422",
  text: "#DCE3EC",
  muted: "rgba(220,227,236,0.5)",
  hover: "rgba(255,255,255,0.05)",
  active: "rgba(255,255,255,0.09)",
  accent: brand.goldLight,
  border: "rgba(255,255,255,0.06)",
};

/** Categorical palette for charts (balance bars, monthly allocation), colour-blind distinguishable. */
export const chart = {
  light: { taken: "#1F3A5F", scheduled: "#5B85BD", pending: "#D9A520", remaining: "#E4E8EE", over: "#C0392B" },
  dark: { taken: "#8FB3E3", scheduled: "#4F78AE", pending: "#E0B54A", remaining: "#243042", over: "#E57373" },
};
