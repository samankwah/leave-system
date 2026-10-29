"use client";

import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { theme } from "@/theme/theme";
import { ToastProvider } from "./ui/Toaster";

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme} defaultMode="system" disableTransitionOnChange>
      <CssBaseline enableColorScheme />
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  );
}
