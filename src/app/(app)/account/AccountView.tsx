"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid2";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import ColorModeSwitch from "@/components/ColorModeSwitch";
import { KeyValue, PageHeader, Section } from "@/components/common";
import { useToast } from "@/components/ui/Toaster";
import { api, errorText } from "@/lib/client";
import { initials } from "@/lib/format";

/** Rough strength score 0–4 for user feedback only (server enforces the actual rules). */
function strength(pw: string): { score: number; label: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return { score: s, label: ["Too weak", "Weak", "Fair", "Good", "Strong"][s] };
}

export default function AccountView({ name, subtitle, profile }: { name: string; subtitle: string; profile: [string, string][] }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const st = strength(next);
  const mismatch = confirm.length > 0 && confirm !== next;
  const meets = next.length >= 8 && /[A-Za-z]/.test(next) && /\d/.test(next);

  async function change(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!meets) return setError("Use at least 8 characters with letters and numbers.");
    if (next !== confirm) return setError("The new passwords do not match.");
    setBusy(true);
    try {
      await api("/api/account/password", "POST", { current, next });
      toast.success("Password changed.");
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const eye = (
    <InputAdornment position="end">
      <IconButton size="small" onClick={() => setShow(!show)} aria-label={show ? "Hide passwords" : "Show passwords"}>
        {show ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
      </IconButton>
    </InputAdornment>
  );

  return (
    <>
      <PageHeader title="Account" subtitle="Your profile, password and display preferences." />
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Stack spacing={2.5}>
            <Section>
              <Stack direction="row" spacing={2} sx={{ alignItems: "center", mb: 2.5 }}>
                <Avatar sx={{ width: 56, height: 56, fontSize: "1.25rem", fontWeight: 700, bgcolor: "primary.main", color: "primary.contrastText" }}>{initials(name)}</Avatar>
                <Box>
                  <Typography variant="h6">{name}</Typography>
                  <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
                </Box>
              </Stack>
              <KeyValue rows={profile} />
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
                Your profile, staff category and entitlement are maintained by HR. Contact HR if anything is wrong.
              </Typography>
            </Section>
            <Section title="Appearance" subtitle="Auto follows your device setting.">
              <ColorModeSwitch />
            </Section>
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Section title="Change password">
            <Stack component="form" spacing={2} onSubmit={change} noValidate>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField type={show ? "text" : "password"} label="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required
                slotProps={{ input: { endAdornment: eye } }} />
              <Box>
                <TextField fullWidth type={show ? "text" : "password"} label="New password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required
                  helperText="At least 8 characters, including letters and numbers." />
                {next && (
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mt: 0.5 }}>
                    <LinearProgress variant="determinate" value={(st.score / 4) * 100} sx={{ flex: 1, height: 6 }}
                      color={st.score <= 1 ? "error" : st.score === 2 ? "warning" : "success"} />
                    <Typography variant="caption" sx={{ minWidth: 60 }}>{st.label}</Typography>
                  </Stack>
                )}
              </Box>
              <TextField type={show ? "text" : "password"} label="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required
                error={mismatch} helperText={mismatch ? "Passwords don't match" : " "} />
              <Box><Button type="submit" variant="contained" disabled={busy || !current || !next}>Update password</Button></Box>
            </Stack>
          </Section>
        </Grid>
      </Grid>
    </>
  );
}
