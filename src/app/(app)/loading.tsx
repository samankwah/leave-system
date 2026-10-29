import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid2";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";

/** Route-level skeleton shown while a page's server data loads. */
export default function Loading() {
  return (
    <Box aria-busy="true" aria-label="Loading">
      <Skeleton width={160} height={18} />
      <Skeleton width={320} height={40} />
      <Skeleton width={420} height={20} sx={{ mb: 3 }} />
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper sx={{ p: 2.5, borderRadius: "14px" }}>
            <Skeleton width="40%" height={28} />
            <Skeleton variant="rounded" height={12} sx={{ my: 2 }} />
            <Stack direction="row" spacing={2}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={64} sx={{ flex: 1 }} />)}</Stack>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper sx={{ p: 2.5, borderRadius: "14px" }}>
            <Skeleton width="60%" height={28} />
            {[0, 1, 2].map((i) => <Skeleton key={i} height={24} />)}
          </Paper>
        </Grid>
        <Grid size={12}>
          <Paper sx={{ p: 2.5, borderRadius: "14px" }}>
            <Skeleton width="30%" height={28} sx={{ mb: 1 }} />
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 1 }}>
              {Array.from({ length: 12 }, (_, i) => <Skeleton key={i} variant="rounded" height={72} />)}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
