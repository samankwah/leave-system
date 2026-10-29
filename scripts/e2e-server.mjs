// Starts the production server against a throw-away PGlite database with a fixed "today" for E2E tests.
// DATABASE_URL is blanked so tests never touch the Neon database configured in .env.local
// (Next.js does not override environment variables that are already set, even if empty).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const port = process.argv[2] ?? "3100";
const dir = path.join(process.cwd(), "data", "e2e");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const child = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", port], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: "",
    DATABASE_URL_UNPOOLED: "",
    LEAVE_DB_PATH: path.join(dir, "pglite"),
    LEAVE_TODAY: "2026-10-29",
    NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? ".next-build",
  },
});
const stop = () => child.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
