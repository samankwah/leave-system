// Starts the production server against a throw-away database with a fixed "today" for E2E tests.
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
    LEAVE_DB_PATH: path.join(dir, "leave.db"),
    LEAVE_UPLOADS_DIR: path.join(dir, "uploads"),
    LEAVE_TODAY: "2026-10-29",
  },
});
const stop = () => child.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
