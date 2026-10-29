// Deletes the local PGlite database; it is recreated with demo data on the next start.
// (To reset the Neon database, sign in as the System Administrator and use "Reset demo data".)
import fs from "node:fs";
import path from "node:path";

const dir = process.env.LEAVE_DB_PATH ?? path.join(process.cwd(), "data", "pglite");
fs.rmSync(dir, { recursive: true, force: true });
console.log(`Removed ${dir}. Demo data will be reloaded on next start.`);
