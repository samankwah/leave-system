"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import KeyboardCapslockIcon from "@mui/icons-material/KeyboardCapslock";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { api, errorText } from "@/lib/client";

const DEMO_PASSWORD = "Demo@2026";

const PERSONAS: { id: string; name: string; role: string; hint: string }[] = [
  { id: "GRA-1001", name: "Kofi Adjei", role: "Employee · senior", hint: "Approved plan with 13 days in March" },
  { id: "GRA-1007", name: "Ama Darko", role: "Employee · junior", hint: "No plan yet — create one" },
  { id: "GRA-7001", name: "Kwame Mensah", role: "Manager", hint: "Requests waiting for approval" },
  { id: "GRA-7002", name: "Abena Owusu", role: "Manager", hint: "Pending plan and request" },
  { id: "GRA-8001", name: "Efua Asante", role: "HR Administrator", hint: "Policies, roster and reports" },
  { id: "GRA-9001", name: "Yaw Boateng", role: "System Administrator", hint: "User access and audit" },
];

/** Decorative calendar motif for the brand panel (pure SVG, no external assets). */
function CalendarArt() {
  const cells = Array.from({ length: 35 }, (_, i) => i);
  const on = new Set([9, 10, 11, 12, 22, 23, 24]);
  const pend = new Set([17, 18]);
  return (
    <Box component="svg" viewBox="0 0 280 210" sx={{ width: "100%", maxWidth: 360, opacity: 0.95 }} aria-hidden>
      <rect x="0" y="0" width="280" height="210" rx="18" fill="rgba(255,255,255,0.06)" />
      {cells.map((i) => {
        const x = 18 + (i % 7) * 36;
        const y = 22 + Math.floor(i / 7) * 36;
        const fill = on.has(i) ? "#E0B54A" : pend.has(i) ? "rgba(224,181,74,0.35)" : i % 7 >= 5 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.10)";
        return <rect key={i} x={x} y={y} width="28" height="28" rx="7" fill={fill} />;
      })}
    </Box>
  );
}

export default function LoginForm({ justReset }: { justReset: boolean }) {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loginError = touched && !login.trim() ? "Enter your Employee ID or official email" : "";
  const pwError = touched && !password ? "Enter your password" : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!login.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", "POST", { login, password });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(380px, 5fr) 7fr" }, bgcolor: "background.default" }}>
      <Box sx={{
        display: { xs: "none", md: "flex" }, flexDirection: "column", justifyContent: "space-between", p: 5,
        bgcolor: "sidebar.bg", color: "sidebar.text", position: "relative", overflow: "hidden",
      }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
          <Box sx={{ width: 36, height: 36, borderRadius: 2, display: "grid", placeItems: "center", bgcolor: "sidebar.accent", color: "#1A1405", fontWeight: 800 }}>LM</Box>
          <Typography sx={{ fontWeight: 700 }}>Leave Management</Typography>
        </Stack>
        <Box>
          <Typography sx={{ fontSize: "2.125rem", fontWeight: 750, lineHeight: 1.15, letterSpacing: "-0.02em", maxWidth: 420 }}>
            Plan the year. Book with confidence.
          </Typography>
          <Typography sx={{ mt: 2, color: "sidebar.muted", maxWidth: 420 }}>
            Annual master plans, monthly scheduling capacity and approvals in one place — with every rule checked as you go.
          </Typography>
          <Box sx={{ mt: 5 }}><CalendarArt /></Box>
        </Box>
        <Typography variant="caption" sx={{ color: "sidebar.muted" }}>
          Prototype for the Ghana Revenue Authority using synthetic data. Not an official GRA system.
        </Typography>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", p: { xs: 2.5, sm: 5 } }}>
        <Box sx={{ width: "100%", maxWidth: 440 }}>
          <Box sx={{ display: { md: "none" }, mb: 3 }}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
              <Box sx={{ width: 34, height: 34, borderRadius: 2, display: "grid", placeItems: "center", bgcolor: "secondary.main", color: "#1A1405", fontWeight: 800 }}>LM</Box>
              <Typography sx={{ fontWeight: 700 }}>Leave Management · GRA prototype</Typography>
            </Stack>
          </Box>
          <Typography variant="h4" component="h1">Sign in</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 3 }}>Use your Employee ID or official email address.</Typography>

          <Stack component="form" onSubmit={submit} noValidate spacing={2}>
            {justReset && !error && <Alert severity="success">Demo data was reset. Sign in again to continue.</Alert>}
            {error && <Alert severity="error" role="alert">{error}</Alert>}
            <TextField
              label="Employee ID or email" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoFocus
              error={!!loginError} helperText={loginError || " "} fullWidth size="medium"
            />
            <TextField
              label="Password" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyUp={(e) => setCaps(e.getModifierState?.("CapsLock") ?? false)} onKeyDown={(e) => setCaps(e.getModifierState?.("CapsLock") ?? false)}
              autoComplete="current-password" error={!!pwError} fullWidth size="medium"
              helperText={pwError || (caps ? <Stack component="span" direction="row" spacing={0.5} sx={{ alignItems: "center", color: "warning.main" }}><KeyboardCapslockIcon sx={{ fontSize: "0.875rem" }} /><span>Caps Lock is on</span></Stack> : " ")}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShow(!show)} edge="end" aria-label={show ? "Hide password" : "Show password"}>
                        {show ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Button type="submit" variant="contained" size="large" disabled={busy} startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </Stack>

          <Box sx={{ mt: 5 }}>
            <Stack direction="row" sx={{ alignItems: "baseline", justifyContent: "space-between", mb: 1.25 }}>
              <Typography variant="subtitle2">Demo accounts</Typography>
              <Typography variant="caption" color="text.secondary">Password <Box component="code" sx={{ fontWeight: 700 }}>{DEMO_PASSWORD}</Box></Typography>
            </Stack>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1 }}>
              {PERSONAS.map((p) => {
                const active = login === p.id;
                return (
                  <ButtonBase key={p.id} onClick={() => { setLogin(p.id); setPassword(DEMO_PASSWORD); setError(null); setTouched(false); }}
                    aria-label={`Use demo account ${p.name}, ${p.role}`}
                    sx={{
                      display: "block", textAlign: "left", p: 1.25, borderRadius: 2, border: 1, bgcolor: "background.paper",
                      borderColor: active ? "primary.main" : "divider", "&:hover": { borderColor: "primary.main" },
                    }}>
                    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "baseline" }}>
                      <Typography variant="body2" sx={{ fontWeight: 650 }}>{p.name}</Typography>
                      <Typography variant="caption" color="text.disabled" sx={{ fontFamily: "monospace" }}>{p.id}</Typography>
                    </Stack>
                    <Typography variant="caption" color="secondary.main" sx={{ fontWeight: 600, display: "block" }}>{p.role}</Typography>
                    <Typography variant="caption" color="text.secondary">{p.hint}</Typography>
                  </ButtonBase>
                );
              })}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
              Emails follow firstname.lastname@demo-gra.test. All data is synthetic.
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
