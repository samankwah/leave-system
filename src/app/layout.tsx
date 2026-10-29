import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import ThemeRegistry from "@/components/ThemeRegistry";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Leave Management – GRA prototype", template: "%s · Leave Management" },
  description: "Prototype for annual leave planning, scheduling, approval and monitoring. Synthetic data only.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F6F8" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1521" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" className={inter.variable} suppressHydrationWarning>
      <body>
        <InitColorSchemeScript attribute="class" defaultMode="system" />
        <AppRouterCacheProvider options={{ enableCssLayer: true }}>
          <ThemeRegistry>{children}</ThemeRegistry>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
