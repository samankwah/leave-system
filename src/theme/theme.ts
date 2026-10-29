"use client";

import { alpha, createTheme } from "@mui/material/styles";
import { brand, chart, leaveDark, leaveLight, sidebarDark, sidebarLight, type LeavePalette, type SidebarPalette } from "./tokens";

declare module "@mui/material/styles" {
  interface Palette {
    leave: LeavePalette;
    sidebar: SidebarPalette;
    chart: typeof chart.light;
  }
  interface PaletteOptions {
    leave?: LeavePalette;
    sidebar?: SidebarPalette;
    chart?: typeof chart.light;
  }
}

const FONT = 'var(--font-inter), "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "class" },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: brand.navy, dark: brand.navyDark, light: brand.navyLight, contrastText: "#fff" },
        secondary: { main: brand.gold, light: brand.goldLight, contrastText: "#fff" },
        success: { main: "#2F7D52" },
        warning: { main: "#B7791F" },
        error: { main: "#C0392B" },
        info: { main: "#2B6CB0" },
        background: { default: "#F5F6F8", paper: "#FFFFFF" },
        divider: "#E4E7EC",
        text: { primary: "#101828", secondary: "#475467", disabled: "#98A2B3" },
        leave: leaveLight,
        sidebar: sidebarLight,
        chart: chart.light,
      },
    },
    dark: {
      palette: {
        primary: { main: "#8FB3E3", dark: "#6B93C9", light: "#B6CFF0", contrastText: "#0B1320" },
        secondary: { main: brand.goldLight, contrastText: "#1A1405" },
        success: { main: "#5CB884" },
        warning: { main: "#E0B54A" },
        error: { main: "#EF7B7B" },
        info: { main: "#7FB2EA" },
        background: { default: "#0E1521", paper: "#151E2B" },
        divider: "#263142",
        text: { primary: "#E6EAF0", secondary: "#9AA5B5", disabled: "#5E6A7B" },
        leave: leaveDark,
        sidebar: sidebarDark,
        chart: chart.dark,
      },
    },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: FONT,
    fontSize: 14,
    h1: { fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em" },
    h2: { fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.02em" },
    h3: { fontSize: "1.5rem", fontWeight: 650, letterSpacing: "-0.015em" },
    h4: { fontSize: "1.375rem", fontWeight: 650, letterSpacing: "-0.01em" },
    h5: { fontSize: "1.25rem", fontWeight: 650, letterSpacing: "-0.01em" },
    h6: { fontSize: "1rem", fontWeight: 650 },
    subtitle1: { fontSize: "0.9375rem", fontWeight: 600 },
    subtitle2: { fontSize: "0.8125rem", fontWeight: 600 },
    body1: { fontSize: "0.9375rem" },
    body2: { fontSize: "0.875rem" },
    caption: { fontSize: "0.75rem" },
    overline: { fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em" },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: (t) => ({
        body: { WebkitFontSmoothing: "antialiased", fontFeatureSettings: '"cv11", "ss01"' },
        "::selection": { background: alpha(brand.gold, 0.28) },
        "*:focus-visible": { outline: `2px solid ${t.vars?.palette.secondary.main ?? brand.gold}`, outlineOffset: 2 },
      }),
    },
    MuiButtonBase: { defaultProps: { disableRipple: false } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 8, paddingInline: 14, minHeight: 36 },
        sizeSmall: { minHeight: 30, paddingInline: 10, fontSize: "0.8125rem" },
        sizeLarge: { minHeight: 44, paddingInline: 20, fontSize: "0.9375rem" },
        outlined: ({ theme }) => ({ borderColor: theme.vars.palette.divider, "&:hover": { borderColor: theme.vars.palette.text.disabled } }),
      },
    },
    MuiIconButton: { styleOverrides: { root: { borderRadius: 8 } } },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: "none" },
        outlined: ({ theme }) => ({ borderColor: theme.vars.palette.divider }),
      },
      variants: [{ props: { variant: "elevation", elevation: 0 }, style: ({ theme }) => ({ border: `1px solid ${theme.vars.palette.divider}` }) }],
    },
    MuiCard: { defaultProps: { variant: "outlined" } },
    MuiAppBar: { defaultProps: { elevation: 0, color: "inherit" }, styleOverrides: { root: { border: "none" } } },
    MuiDrawer: { styleOverrides: { paper: { border: "none" } } },
    MuiTextField: { defaultProps: { size: "small" } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 8,
          backgroundColor: theme.vars.palette.background.paper,
          "& .MuiOutlinedInput-notchedOutline": { borderColor: theme.vars.palette.divider },
        }),
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: ({ theme }) => ({ borderColor: theme.vars.palette.divider, paddingTop: 10, paddingBottom: 10 }),
        head: ({ theme }) => ({
          fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em",
          color: theme.vars.palette.text.secondary, backgroundColor: theme.vars.palette.background.paper,
        }),
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: ({ theme }) => ({ "&.MuiTableRow-hover:hover": { backgroundColor: theme.vars.palette.action.hover } }),
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 6, fontWeight: 600 },
        sizeSmall: { height: 22, fontSize: "0.72rem" },
        outlined: ({ theme }) => ({ borderColor: theme.vars.palette.divider }),
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: ({ theme }) => ({ minHeight: 40, borderBottom: `1px solid ${theme.vars.palette.divider}` }),
        indicator: { height: 2, borderRadius: 2 },
      },
    },
    MuiTab: { styleOverrides: { root: { minHeight: 40, textTransform: "none", fontWeight: 600, paddingInline: 12, minWidth: 0 } } },
    MuiTooltip: {
      defaultProps: { arrow: true },
      styleOverrides: { tooltip: { fontSize: "0.75rem", borderRadius: 6, padding: "6px 10px" } },
    },
    MuiDialog: {
      styleOverrides: {
        paper: ({ theme }) => ({ borderRadius: 14, border: `1px solid ${theme.vars.palette.divider}` }),
      },
    },
    MuiDialogTitle: { styleOverrides: { root: { fontSize: "1.0625rem", fontWeight: 650 } } },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 10, alignItems: "flex-start" },
        standardInfo: ({ theme }) => ({ border: `1px solid ${alpha(theme.palette.info.main, 0.25)}` }),
        standardWarning: ({ theme }) => ({ border: `1px solid ${alpha(theme.palette.warning.main, 0.3)}` }),
        standardError: ({ theme }) => ({ border: `1px solid ${alpha(theme.palette.error.main, 0.25)}` }),
        standardSuccess: ({ theme }) => ({ border: `1px solid ${alpha(theme.palette.success.main, 0.25)}` }),
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: ({ theme }) => ({ border: `1px solid ${theme.vars.palette.divider}`, boxShadow: "0 12px 32px rgba(16,24,40,0.12)" }),
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: ({ theme }) => ({ border: `1px solid ${theme.vars.palette.divider}`, boxShadow: "0 12px 32px rgba(16,24,40,0.12)" }),
      },
    },
    MuiLinearProgress: { styleOverrides: { root: { borderRadius: 4 } } },
    MuiListItemButton: { styleOverrides: { root: { borderRadius: 8 } } },
    MuiSkeleton: { defaultProps: { animation: "wave" } },
  },
});
