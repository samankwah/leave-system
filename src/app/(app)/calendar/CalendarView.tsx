"use client";

import { useMemo, useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid2";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { messages } from "@/domain/messages";
import { analyseRequest } from "@/domain/requestRules";
import type { Issue, MonthKey } from "@/domain/types";
import { formatRange, monthKey, monthLabel, monthNumber, yearMonths } from "@/domain/workingDays";
import LeaveCalendar, { MonthStrip, shiftMonth, type Selection } from "@/components/LeaveCalendar";
import Wallchart from "@/components/Wallchart";
import { IssueAlerts, KeyValue, PageHeader, Section } from "@/components/common";
import { fmtDay } from "@/lib/format";
import type { CalendarData, WallchartData } from "@/server/services/queries";

interface Props {
  data: CalendarData;
  years: number[];
  initialMonth?: MonthKey;
  initialView: "mine" | "team";
  team: WallchartData | null;
  teamLabel: string;
}

export default function CalendarView({ data, years, initialMonth, initialView, team, teamLabel }: Props) {
  const router = useRouter();
  const [view, setView] = useState(initialView);
  const [month, setMonth] = useState<MonthKey>(
    initialMonth ?? yearMonths(data.year).find((m) => m >= data.today.slice(0, 7) && !data.restrictedMonths.includes(monthNumber(m))) ?? monthKey(data.year, 2),
  );
  const [sel, setSel] = useState<Selection>({});
  const [clickIssue, setClickIssue] = useState<Issue | null>(null);
  const holidays = useMemo(() => new Map(data.holidays.map((h) => [h.date, h.name])), [data.holidays]);
  const holidaySet = useMemo(() => new Set(holidays.keys()), [holidays]);
  const ownMonths = new Set(data.allocations.filter((a) => a.employeeId === data.employeeId).map((a) => a.month));

  const period = sel.start ? { start: sel.start, end: sel.end ?? sel.start } : null;
  const analysis = period ? analyseRequest(period, {
    employeeId: data.employeeId, today: data.today, holidays: holidaySet, restrictedMonths: data.restrictedMonths,
    capacity: data.capacity, entitlement: data.entitlement, approvedPlan: data.approvedPlan?.periods ?? null,
    existing: data.requests.filter((r) => r.status === "pending" || r.status === "approved")
      .map((r) => ({ id: r.id, start: r.start, end: r.end, status: r.status as "pending" | "approved", days: r.days })),
    allocations: data.allocations, mode: "submit",
  }) : null;
  const issues = [...(clickIssue ? [clickIssue] : []), ...(analysis?.issues ?? [])];
  const visibleHolidays = data.holidays.filter((h) => h.date.startsWith(month) || h.date.startsWith(shiftMonth(month, 1)));
  const minM = monthKey(data.year, 1);
  const maxM = monthKey(data.year, 12);

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="Monthly scheduling capacity, your planned and booked leave, and public holidays."
        actions={
          <TextField select size="small" value={data.year} aria-label="Year" sx={{ width: 104 }} onChange={(e) => router.push(`/calendar?year=${e.target.value}${view === "team" ? "&view=team" : ""}`)}>
            {years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
          </TextField>
        }
      />
      {team && (
        <Tabs value={view} onChange={(_, v) => setView(v)} sx={{ mb: 2.5 }}>
          <Tab value="mine" label="My calendar" />
          <Tab value="team" label={`${teamLabel} wallchart`} />
        </Tabs>
      )}

      <Section title={`${data.year} capacity`} subtitle={`Up to ${data.capacity} distinct employees per month. Plans and requests reserve a slot; one person counts once per month.`} sx={{ mb: 2.5 }}>
        <MonthStrip year={data.year} occupancy={data.occupancy} restrictedMonths={data.restrictedMonths}
          myDays={data.approvedPlan?.monthly ?? {}} myLabel="planned" current={month} onPick={setMonth} ownMonths={ownMonths} />
      </Section>

      {view === "team" && team ? (
        <Section>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
            <IconButton size="small" aria-label="Previous month" disabled={month <= minM} onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeftIcon /></IconButton>
            <Typography variant="subtitle1" sx={{ minWidth: 150, textAlign: "center" }}>{monthLabel(month)}</Typography>
            <IconButton size="small" aria-label="Next month" disabled={month >= maxM} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRightIcon /></IconButton>
            <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
              {data.occupancy[month]?.count ?? 0}/{data.capacity} organisation-wide slots used
            </Typography>
          </Stack>
          <Wallchart data={team} month={month} holidays={holidays} today={data.today} restricted={data.restrictedMonths.includes(monthNumber(month))} />
        </Section>
      ) : (
        <Grid container spacing={2.5}>
          <Grid size={{ xs: 12, lg: 8 }}>
            <Section>
              <LeaveCalendar
                month={month} onMonthChange={setMonth} minMonth={minM} maxMonth={maxM}
                holidays={holidays} restrictedMonths={data.restrictedMonths} occupancy={data.occupancy} ownMonths={ownMonths}
                layers={{
                  planned: data.approvedPlan?.periods,
                  pending: data.requests.filter((r) => r.status === "pending"),
                  approved: data.requests.filter((r) => r.status === "approved"),
                }}
                today={data.today} selection={sel}
                onSelect={(s) => { setSel(s); setClickIssue(null); }}
                onRestricted={(m) => setClickIssue(messages.restricted(data.restrictedMonths, m))}
              />
            </Section>
          </Grid>
          <Grid size={{ xs: 12, lg: 4 }}>
            <Stack spacing={2.5} sx={{ position: { lg: "sticky" }, top: { lg: 88 } }}>
              <Section title="Check dates">
                {!period ? (
                  <>
                    <Typography variant="body2" color="text.secondary">Select a start and end date to check them against your plan, balance and monthly capacity.</Typography>
                    {clickIssue && <Box sx={{ mt: 1.5 }}><IssueAlerts issues={[clickIssue]} /></Box>}
                  </>
                ) : (
                  <Stack spacing={2}>
                    <KeyValue rows={[
                      ["Dates", formatRange(period)],
                      ["Working days", analysis?.days ?? 0],
                      ...Object.entries(analysis?.breakdown ?? {}).map(([m, d]) => [monthLabel(m), `${d} requested · ${analysis?.planBreakdown[m] ?? 0} in plan`] as [string, string]),
                      ["Balance after", `${analysis?.balanceAfter} of ${data.entitlement}`],
                    ]} />
                    <IssueAlerts issues={issues} success="Available — you can request these dates." />
                    <Stack direction="row" spacing={1}>
                      <Button variant="contained" component={NextLink} href={`/requests/new?start=${period.start}&end=${period.end}`}>Request these dates</Button>
                      <Button onClick={() => { setSel({}); setClickIssue(null); }}>Clear</Button>
                    </Stack>
                  </Stack>
                )}
              </Section>
              <Section title="Public holidays">
                {visibleHolidays.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">None in {monthLabel(month)} or {monthLabel(shiftMonth(month, 1))}.</Typography>
                ) : (
                  <Stack spacing={1}>
                    {visibleHolidays.map((h) => (
                      <Stack key={h.date} direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "leave.holidayAccent" }} />
                        <Typography variant="body2" sx={{ flex: 1 }}>{h.name}</Typography>
                        <Typography variant="body2" color="text.secondary">{fmtDay(h.date)}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </Section>
            </Stack>
          </Grid>
        </Grid>
      )}
    </>
  );
}
