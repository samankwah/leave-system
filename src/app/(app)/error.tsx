"use client";

import Link from "next/link";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import EmptyState from "@/components/ui/EmptyState";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Paper sx={{ borderRadius: "14px", maxWidth: 640, mx: "auto", mt: 4 }}>
      <EmptyState
        icon={<ErrorOutlineIcon />}
        title="Something went wrong"
        description={`This page couldn't be loaded. Your data is safe — try again, or go back to your dashboard.${error.digest ? ` (Reference ${error.digest})` : ""}`}
        action={
          <Stack direction="row" spacing={1} sx={{ justifyContent: "center" }}>
            <Button variant="contained" onClick={reset}>Try again</Button>
            <Button component={Link} href="/dashboard">Dashboard</Button>
          </Stack>
        }
      />
    </Paper>
  );
}
