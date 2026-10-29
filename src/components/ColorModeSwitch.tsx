"use client";

import { useEffect, useState } from "react";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { useColorScheme } from "@mui/material/styles";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import SettingsBrightnessOutlinedIcon from "@mui/icons-material/SettingsBrightnessOutlined";

/** Light / System / Dark segmented control. Persisted by MUI's colour-scheme storage. */
export default function ColorModeSwitch({ fullWidth }: { fullWidth?: boolean }) {
  const { mode, setMode } = useColorScheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const value = mounted ? mode ?? "system" : null;
  return (
    <ToggleButtonGroup
      size="small" exclusive fullWidth={fullWidth} value={value} aria-label="Colour theme"
      onChange={(_, v) => v && setMode(v)}
      sx={{ "& .MuiToggleButton-root": { textTransform: "none", gap: 0.75, px: 1.25, fontWeight: 600 } }}
    >
      <ToggleButton value="light" aria-label="Light theme"><LightModeOutlinedIcon fontSize="small" />Light</ToggleButton>
      <ToggleButton value="system" aria-label="Use system theme"><SettingsBrightnessOutlinedIcon fontSize="small" />Auto</ToggleButton>
      <ToggleButton value="dark" aria-label="Dark theme"><DarkModeOutlinedIcon fontSize="small" />Dark</ToggleButton>
    </ToggleButtonGroup>
  );
}
