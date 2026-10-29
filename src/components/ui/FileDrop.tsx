"use client";

import { useRef, useState } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";

const TYPES = ["application/pdf", "image/png", "image/jpeg"];

/** Drag-and-drop (or click) single-file picker with type/size validation. */
export default function FileDrop({ file, onChange, maxBytes = 2 * 1024 * 1024, label = "Supporting document" }: {
  file: File | null;
  onChange: (f: File | null) => void;
  maxBytes?: number;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (!TYPES.includes(f.type)) return setError("Use a PDF, PNG or JPEG file.");
    if (f.size > maxBytes) return setError(`Files must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`);
    onChange(f);
  }

  if (file) {
    return (
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", p: 1.25, border: 1, borderColor: "divider", borderRadius: 2 }}>
        <InsertDriveFileOutlinedIcon color="primary" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{file.name}</Typography>
          <Typography variant="caption" color="text.secondary">{Math.ceil(file.size / 1024)} KB</Typography>
        </Box>
        <IconButton size="small" aria-label="Remove file" onClick={() => { onChange(null); if (input.current) input.current.value = ""; }}><CloseIcon fontSize="small" /></IconButton>
      </Stack>
    );
  }

  return (
    <Box>
      <Box
        role="button" tabIndex={0} aria-label={`${label}: drop a file or click to browse`}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}
        sx={{
          border: "1.5px dashed", borderColor: error ? "error.main" : over ? "primary.main" : "divider", borderRadius: 2, p: 2,
          textAlign: "center", cursor: "pointer", bgcolor: over ? "action.hover" : "transparent", transition: "all .15s",
          "&:hover": { borderColor: "primary.main" },
        }}
      >
        <UploadFileOutlinedIcon sx={{ color: "text.secondary" }} />
        <Typography variant="body2"><b>Drop a file</b> or click to browse</Typography>
        <Typography variant="caption" color="text.secondary">PDF, PNG or JPEG · up to {Math.round(maxBytes / 1024 / 1024)} MB · optional</Typography>
        <input ref={input} hidden type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(e) => pick(e.target.files?.[0])} />
      </Box>
      {error && <Typography variant="caption" color="error" role="alert">{error}</Typography>}
    </Box>
  );
}
