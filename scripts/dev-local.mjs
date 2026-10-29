// `npm run dev:local` — development server on a local PGlite database (data/pglite), ignoring the
// Neon DATABASE_URL in .env.local. Use `npm run dev` to develop against Neon instead.
import { spawn } from "node:child_process";
import path from "node:path";

const child = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "dev", "--turbopack", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: "", DATABASE_URL_UNPOOLED: "" },
});
child.on("exit", (code) => process.exit(code ?? 0));
