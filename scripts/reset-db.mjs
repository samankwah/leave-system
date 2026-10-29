// Deletes the local SQLite database; it is recreated with demo data on the next request.
import fs from "node:fs";
import path from "node:path";

const file = process.env.LEAVE_DB_PATH ?? path.join(process.cwd(), "data", "leave.db");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(file + suffix, { force: true });
console.log(`Removed ${file}. Demo data will be reloaded on next start.`);
