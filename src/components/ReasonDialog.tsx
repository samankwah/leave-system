"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";

export default function ReasonDialog(props: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  required?: boolean;
  color?: "primary" | "error" | "warning" | "success";
  busy?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const missing = props.required && !reason.trim();
  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="sm" TransitionProps={{ onExited: () => { setReason(""); setTouched(false); } }}>
      <DialogTitle>{props.title}</DialogTitle>
      <DialogContent>
        {props.description && <DialogContentText sx={{ mb: 2 }}>{props.description}</DialogContentText>}
        <TextField
          autoFocus fullWidth multiline minRows={3} label={props.required ? "Reason (required)" : "Comment (optional)"}
          value={reason} onChange={(e) => setReason(e.target.value)} onBlur={() => setTouched(true)}
          error={touched && !!missing} helperText={touched && missing ? "Please give a reason so the employee knows what to change." : " "}
          inputProps={{ maxLength: 1000 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose} disabled={props.busy}>Cancel</Button>
        <Button
          variant="contained" color={props.color ?? "primary"} disabled={props.busy}
          onClick={() => { setTouched(true); if (!missing) props.onConfirm(reason.trim()); }}
        >
          {props.confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
