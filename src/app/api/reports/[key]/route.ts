import { route } from "@/server/api";
import { getPolicy } from "@/server/repos/settings";
import { reportToCsv, reportToXlsx, runReport } from "@/server/services/reportService";

export const GET = route(["hr", "sysadmin"], async ({ db, user, params, req }) => {
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year")) || getPolicy(db).activeYear;
  const report = runReport(db, user, params.key, year);
  const format = url.searchParams.get("format");
  const name = `gra-leave-${report.key}-${year}`;
  if (format === "csv") {
    return new Response(reportToCsv(report), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
    });
  }
  if (format === "xlsx") {
    return new Response(new Uint8Array(await reportToXlsx(report)), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      },
    });
  }
  return report;
});
