import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

export default function NotFound() {
  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 3, bgcolor: "background.default", textAlign: "center" }}>
      <Box>
        <Typography sx={{ fontSize: "4rem", fontWeight: 800, color: "secondary.main", lineHeight: 1 }}>404</Typography>
        <Typography variant="h5" sx={{ mt: 1 }}>Page not found</Typography>
        <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>The page you&apos;re looking for doesn&apos;t exist or has moved.</Typography>
        <Button variant="contained" component={Link} href="/dashboard">Go to dashboard</Button>
      </Box>
    </Box>
  );
}
