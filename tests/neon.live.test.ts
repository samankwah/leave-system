import { describe, expect, it } from "vitest";
import { openPg, withVerifiedSsl } from "@/server/drivers";

// Opt-in check against the real Neon database: NEON_LIVE=1 with DATABASE_URL set (e.g. from .env.local).
describe.skipIf(!process.env.NEON_LIVE || !process.env.DATABASE_URL)("Neon connection (live)", () => {
  it("connects over verified TLS without pg's sslmode deprecation warning", async () => {
    const warnings: string[] = [];
    const onWarning = (w: Error) => warnings.push(w.message);
    process.on("warning", onWarning);
    // With sslmode=verify-full, pg refuses to connect unless the server presents a verified certificate,
    // so a successful query proves the connection is encrypted and authenticated. (pg_stat_ssl would describe
    // the pooler's own link to Postgres, not this connection, when using Neon's pooled endpoint.)
    expect(new URL(withVerifiedSsl(process.env.DATABASE_URL!)).searchParams.get("sslmode")).toBe("verify-full");
    const db = await openPg(process.env.DATABASE_URL!);
    try {
      const r = await db.query<{ ok: number }>("SELECT 1 AS ok");
      expect(r.rows[0]?.ok).toBe(1);
    } finally {
      await db.close();
      process.off("warning", onWarning);
    }
    expect(warnings.filter((w) => /SSL modes/.test(w))).toEqual([]);
  });
});
