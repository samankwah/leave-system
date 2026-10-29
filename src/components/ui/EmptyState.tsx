"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export default function EmptyState({ icon, title, description, action, compact }: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <Box sx={{ textAlign: "center", py: compact ? 3 : 6, px: 2, color: "text.secondary" }}>
      {icon && (
        <Box sx={{
          width: compact ? 40 : 52, height: compact ? 40 : 52, mx: "auto", mb: 1.5, borderRadius: "50%", display: "grid", placeItems: "center",
          bgcolor: "action.hover", color: "text.secondary", "& svg": { fontSize: compact ? 20 : 26 },
        }}>
          {icon}
        </Box>
      )}
      <Typography variant="subtitle1" color="text.primary">{title}</Typography>
      {description && <Typography variant="body2" sx={{ mt: 0.5, maxWidth: 420, mx: "auto" }}>{description}</Typography>}
      {action && <Box sx={{ mt: 2 }}>{action}</Box>}
    </Box>
  );
}
