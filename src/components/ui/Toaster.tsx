"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import Alert, { type AlertColor } from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";

interface Toast { id: number; message: React.ReactNode; severity: AlertColor; duration: number }
interface ToastApi {
  success: (m: React.ReactNode, duration?: number) => void;
  error: (m: React.ReactNode, duration?: number) => void;
  info: (m: React.ReactNode, duration?: number) => void;
  warning: (m: React.ReactNode, duration?: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Queued, auto-dismissing toasts (one visible at a time, bottom-centre). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Toast[]>([]);
  const [open, setOpen] = useState(true);
  const push = useCallback((severity: AlertColor) => (message: React.ReactNode, duration?: number) => {
    setQueue((q) => [...q, { id: Date.now() + Math.random(), message, severity, duration: duration ?? (severity === "error" ? 8000 : 4500) }]);
    setOpen(true);
  }, []);
  const api = useMemo<ToastApi>(() => ({ success: push("success"), error: push("error"), info: push("info"), warning: push("warning") }), [push]);
  const current = queue[0];

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Snackbar
        key={current?.id}
        open={!!current && open}
        autoHideDuration={current?.duration}
        onClose={(_, reason) => { if (reason !== "clickaway") setOpen(false); }}
        TransitionProps={{ onExited: () => { setQueue((q) => q.slice(1)); setOpen(true); } }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {current ? (
          <Alert severity={current.severity} variant="filled" onClose={() => setOpen(false)}
            sx={{ minWidth: { sm: 360 }, maxWidth: 560, boxShadow: "0 12px 32px rgba(16,24,40,0.18)", alignItems: "center" }}>
            {current.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
