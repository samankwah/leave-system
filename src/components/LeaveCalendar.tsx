"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { Theme } from "@mui/material/styles";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import type { MonthKey, MonthStatus, Period } from "@/domain/types";
import {
  MONTH_NAMES, addDays, countWorkingDays, formatDate, formatRange, monthKey, monthKeyOf, monthLabel, monthNumber, parseISO, toISO, yearOf,
} from "@/domain/workingDays";

export interface MonthInfo { count: number; capacity: number; status: MonthStatus }

export interface CalendarLayers {
  planned?: Period[];
  draft?: Period[];
  pending?: Period[];
  approved?: Period[];
}

export interface Selection { start?: string; end?: string }

const within = (d: string, ps?: Period[]) => !!ps?.some((p) => p.start <= d && d <= p.end);

export function shiftMonth(m: MonthKey, delta: number): MonthKey {
  let y = yearOf(m);
  let n = monthNumber(m) + delta;
  while (n > 12) { n -= 12; y += 1; }
  while (n < 1) { n += 12; y -= 1; }
  return monthKey(y, n);
}

export function nextSelection(sel: Selection, d: string): Selection {
  if (!sel.start || sel.end) return { start: d };
  if (d < sel.start) return { start: d, end: sel.start };
  return { start: sel.start, end: d };
}

/* ------------------------------- capacity pips ------------------------------ */

export function CapacityPips({ count, capacity, own, size = 8 }: { count: number; capacity: number; own?: boolean; size?: number }) {
  const n = Math.min(capacity, 12);
  const filled = Math.min(count, n);
  const full = count >= capacity;
  return (
    <Stack direction="row" spacing={0.4} aria-hidden sx={{ alignItems: "center" }}>
      {Array.from({ length: n }, (_, i) => (
        <Box key={i} sx={{
          width: size, height: size, borderRadius: "50%",
          bgcolor: i < filled ? (full ? "error.main" : count === capacity - 1 ? "warning.main" : "primary.main") : "action.disabledBackground",
          outline: own && i === filled - 1 ? "2px solid" : "none", outlineColor: "secondary.main", outlineOffset: 1,
        }} />
      ))}
    </Stack>
  );
}

/* ---------------------------------- legend --------------------------------- */

export function CalendarLegend({ showDraft, compact }: { showDraft?: boolean; compact?: boolean }) {
  const items: [string, object][] = [
    ["Selected", { bgcolor: "leave.selected" }],
    [showDraft ? "In this plan" : "Approved plan", { bgcolor: "leave.planned" }],
    ["Pending", { bgcolor: "leave.pending" }],
    ["Approved leave", { bgcolor: "leave.approved" }],
    ["Fully booked month", { bgcolor: "leave.full" }],
    ["Restricted month", { bgcolor: "leave.restricted", backgroundImage: "repeating-linear-gradient(135deg, rgba(127,127,127,.25) 0 2px, transparent 2px 5px)" }],
    ["Public holiday", { bgcolor: "transparent", border: "2px solid", borderColor: "leave.holidayAccent", borderRadius: "50%", width: 8, height: 8 }],
    ["Today", { bgcolor: "transparent", border: "2px solid", borderColor: "leave.today" }],
  ];
  return (
    <Stack direction="row" sx={{ flexWrap: "wrap", columnGap: 2, rowGap: 0.75, mt: compact ? 1 : 2 }} aria-label="Calendar legend">
      {items.map(([label, sx]) => (
        <Stack key={label} direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
          <Box sx={{ width: 12, height: 12, borderRadius: 0.75, flexShrink: 0, ...sx }} />
          <Typography variant="caption" color="text.secondary">{label}</Typography>
        </Stack>
      ))}
    </Stack>
  );
}

/* ----------------------------------- day ----------------------------------- */

interface DayProps {
  d: string;
  label: string;
  bg: string;
  fg: string;
  bold: boolean;
  dim: boolean;
  today: boolean;
  holiday?: string;
  selectedEnd: boolean;
  inRange: boolean;
  restricted: boolean;
  focusable: boolean;
  interactive: boolean;
  onDayClick: (d: string) => void;
  onDayHover: (d: string | null) => void;
  onKey: (e: React.KeyboardEvent, d: string) => void;
  registerCell: (d: string, el: HTMLButtonElement | null) => void;
}

const DAY_SX_BASE = {
  width: "100%", aspectRatio: "1 / 1", maxHeight: 46, borderRadius: "10px", position: "relative",
  fontSize: 13.5, fontVariantNumeric: "tabular-nums", transition: "background-color .12s, box-shadow .12s",
  "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "secondary.main", outlineOffset: 1 },
} as const;

/** One calendar day. Memoised on primitive props, so a hover re-renders only the cells whose state changes. */
const DayCell = memo(function DayCell(p: DayProps) {
  const button = (
    <ButtonBase
      ref={(el: HTMLButtonElement | null) => p.registerCell(p.d, el)}
      tabIndex={p.focusable ? 0 : -1}
      aria-label={p.label}
      disabled={!p.interactive}
      onClick={() => p.onDayClick(p.d)}
      onMouseEnter={() => p.onDayHover(p.d)}
      onFocus={() => p.onDayHover(p.d)}
      onKeyDown={(e) => p.onKey(e, p.d)}
      sx={{
        ...DAY_SX_BASE,
        bgcolor: p.bg, color: p.fg, fontWeight: p.bold ? 700 : 500, opacity: p.dim ? 0.55 : 1,
        cursor: p.restricted ? "not-allowed" : "pointer",
        backgroundImage: p.restricted ? "repeating-linear-gradient(135deg, rgba(127,127,127,.12) 0 2px, transparent 2px 6px)" : undefined,
        boxShadow: p.today ? (t: Theme) => `inset 0 0 0 2px ${t.vars!.palette.leave.today}` : undefined,
        "&:hover": p.restricted ? undefined : { boxShadow: (t: Theme) => `inset 0 0 0 2px ${t.vars!.palette.primary.main}` },
        "&.Mui-disabled": { color: p.fg, pointerEvents: "none" },
      }}
    >
      {Number(p.d.slice(8))}
      {p.holiday && (
        <Box component="span" sx={{
          position: "absolute", bottom: 5, left: "50%", transform: "translateX(-50%)",
          width: 5, height: 5, borderRadius: "50%", bgcolor: p.selectedEnd ? "currentColor" : "leave.holidayAccent",
        }} />
      )}
    </ButtonBase>
  );
  return (
    <Box role="gridcell" aria-selected={p.inRange || p.selectedEnd} sx={{ px: 0.25 }}>
      {/* Only holidays get a (relatively costly) tooltip; every cell already has a full aria-label. */}
      {p.holiday ? <Tooltip title={p.holiday} disableInteractive placement="top">{button}</Tooltip> : button}
    </Box>
  );
});

/* ---------------------------------- month ---------------------------------- */

interface MonthProps {
  month: MonthKey;
  today?: string;
  holidays: Map<string, string>;
  restricted: boolean;
  full: boolean;
  info?: MonthInfo;
  own: boolean;
  layers: CalendarLayers;
  showDraft?: boolean;
  rangeStart?: string;
  rangeEnd?: string;
  focused: string;
  interactive: boolean;
  onDayClick: (d: string) => void;
  onDayHover: (d: string | null) => void;
  onKey: (e: React.KeyboardEvent, d: string) => void;
  registerCell: (d: string, el: HTMLButtonElement | null) => void;
}

function MonthGrid(p: MonthProps) {
  const y = yearOf(p.month);
  const m = monthNumber(p.month);
  const first = Date.UTC(y, m - 1, 1);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(first).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => toISO(first + i * 86_400_000))];
  while (cells.length % 7) cells.push(null);

  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1.25, minHeight: 28 }}>
        <Typography variant="subtitle1" component="h3">{monthLabel(p.month)}</Typography>
        {p.restricted ? (
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", color: "text.secondary" }}>
            <LockOutlinedIcon sx={{ fontSize: 14 }} /><Typography variant="caption" sx={{ fontWeight: 600 }}>Restricted</Typography>
          </Stack>
        ) : p.info ? (
          <Tooltip title={`${p.info.count} of ${p.info.capacity} employee slots used${p.own ? " (including yours)" : ""}`}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <CapacityPips count={p.info.count} capacity={p.info.capacity} own={p.own} />
              <Typography variant="caption" sx={{ fontWeight: 600, color: p.full ? "error.main" : "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                {p.full ? "Full" : `${p.info.count}/${p.info.capacity}`}
              </Typography>
            </Stack>
          </Tooltip>
        ) : null}
      </Stack>

      <Box role="grid" aria-label={monthLabel(p.month)} sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 0.5 }}>
        <Box role="row" sx={{ display: "contents" }}>
          {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
            <Typography key={d} role="columnheader" variant="caption" color="text.disabled" sx={{ textAlign: "center", fontWeight: 600, pb: 0.5 }}>{d}</Typography>
          ))}
        </Box>
        {cells.map((d, i) => {
          if (!d) return <Box key={`x${i}`} role="gridcell" />;
          const dow = new Date(parseISO(d)).getUTCDay();
          const weekend = dow === 0 || dow === 6;
          const holiday = p.holidays.get(d);
          const inRange = !!p.rangeStart && !!p.rangeEnd && d >= p.rangeStart && d <= p.rangeEnd;
          const isEnd = d === p.rangeStart || d === p.rangeEnd;
          const approved = within(d, p.layers.approved);
          const pending = within(d, p.layers.pending);
          const planned = within(d, p.showDraft ? p.layers.draft : p.layers.planned);
          const isToday = d === p.today;

          let state = "Available";
          let bg = "transparent";
          let fg = weekend ? "text.disabled" : "text.primary";
          if (p.restricted) { state = "Restricted month"; bg = "leave.restricted"; fg = "leave.restrictedText"; }
          else if (p.full && !weekend) { state = "Month fully booked"; bg = "leave.full"; fg = "leave.fullText"; }
          if (planned) { state = p.showDraft ? "In this plan" : "In your approved plan"; bg = "leave.planned"; fg = "leave.plannedText"; }
          if (pending) { state = "Pending"; bg = "leave.pending"; fg = "leave.pendingText"; }
          if (approved) { state = "Approved leave"; bg = "leave.approved"; fg = "leave.approvedText"; }
          if (inRange && !isEnd) { bg = "leave.range"; fg = "text.primary"; }
          if (isEnd && p.rangeStart) { state = "Selected"; bg = "leave.selected"; fg = "leave.selectedText"; }
          const label = `${formatDate(d)}${weekend ? ", weekend" : ""}${holiday ? `, ${holiday}` : ""}. ${state}${isToday ? ", today" : ""}`;

          return (
            <DayCell
              key={d} d={d} label={label} bg={bg} fg={fg} bold={isEnd || isToday}
              dim={weekend && (planned || pending || approved || (inRange && !isEnd))}
              today={isToday} holiday={holiday} selectedEnd={isEnd && !!p.rangeStart} inRange={inRange} restricted={p.restricted}
              focusable={d === p.focused} interactive={p.interactive}
              onDayClick={p.onDayClick} onDayHover={p.onDayHover} onKey={p.onKey} registerCell={p.registerCell}
            />
          );
        })}
      </Box>
    </Box>
  );
}

/* --------------------------------- calendar -------------------------------- */

/**
 * Range picker: two months on desktop, one on phones; hover preview of the range with a live
 * working-day count; arrow-key navigation (Enter selects, Escape clears); restricted and
 * fully booked months clearly marked.
 */
export default function LeaveCalendar(props: {
  month: MonthKey;
  onMonthChange: (m: MonthKey) => void;
  minMonth?: MonthKey;
  maxMonth?: MonthKey;
  holidays: Map<string, string>;
  restrictedMonths: number[];
  occupancy: Record<MonthKey, MonthInfo | undefined>;
  /** Months where the current employee already holds a slot (a full month is still open to them). */
  ownMonths?: Set<MonthKey>;
  layers: CalendarLayers;
  selection: Selection;
  onSelect?: (s: Selection) => void;
  onRestricted?: (m: MonthKey) => void;
  showDraft?: boolean;
  today?: string;
  monthsShown?: 1 | 2;
  hideLegend?: boolean;
}) {
  const { holidays, selection, onSelect } = props;
  const wide = useMediaQuery((t: Theme) => t.breakpoints.up("sm"), { noSsr: false });
  const shown = props.monthsShown ?? (wide ? 2 : 1);
  const lastStart = props.maxMonth ? shiftMonth(props.maxMonth, -(shown - 1)) : undefined;
  const month = lastStart && props.month > lastStart && (!props.minMonth || lastStart >= props.minMonth) ? lastStart : props.month;
  const months = Array.from({ length: shown }, (_, i) => shiftMonth(month, i));
  const holidaySet = useMemo(() => new Set(holidays.keys()), [holidays]);

  const [hover, setHover] = useState<string | null>(null);
  const [focused, setFocused] = useState<string>(selection.start ?? (props.today && monthKeyOf(props.today) === month ? props.today : `${month}-01`));
  const cells = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<string | null>(null);

  // Keep the focusable day inside the visible months.
  useEffect(() => {
    if (!months.includes(monthKeyOf(focused))) setFocused(`${month}-01`);
    if (pendingFocus.current) { cells.current.get(pendingFocus.current)?.focus(); pendingFocus.current = null; }
  }, [month, focused, months]);

  const picking = !!selection.start && !selection.end;
  const previewEnd = picking && hover ? hover : undefined;
  let rangeStart = selection.start;
  let rangeEnd = selection.end ?? previewEnd ?? selection.start;
  if (rangeStart && rangeEnd && rangeEnd < rangeStart) [rangeStart, rangeEnd] = [rangeEnd, rangeStart];
  const previewDays = rangeStart && rangeEnd ? countWorkingDays(rangeStart, rangeEnd, holidaySet) : 0;

  // Callbacks passed to memoised cells must be stable; they read the latest props/state from a ref.
  const latest = useRef({ props, selection, months, month, onSelect });
  latest.current = { props, selection, months, month, onSelect };

  const click = useCallback((d: string) => {
    const { props: pr, selection: sel, onSelect: select } = latest.current;
    const m = monthKeyOf(d);
    if (pr.restrictedMonths.includes(monthNumber(m))) { pr.onRestricted?.(m); return; }
    setFocused(d);
    select?.(nextSelection(sel, d));
  }, []);

  const registerCell = useCallback((d: string, el: HTMLButtonElement | null) => {
    if (el) cells.current.set(d, el); else cells.current.delete(d);
  }, []);

  const onKey = useCallback((e: React.KeyboardEvent, d: string) => {
    const { props, months, month, onSelect } = latest.current;
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in step) {
      e.preventDefault();
      const next = addDays(d, step[e.key]);
      const nm = monthKeyOf(next);
      if ((props.minMonth && nm < props.minMonth) || (props.maxMonth && nm > props.maxMonth)) return;
      if (!months.includes(nm)) props.onMonthChange(nm < month ? shiftMonth(month, -1) : shiftMonth(month, 1));
      setFocused(next);
      setHover(next);
      pendingFocus.current = next;
      if (months.includes(nm)) cells.current.get(next)?.focus();
    } else if (e.key === "Escape") {
      onSelect?.({});
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const dow = (new Date(parseISO(d)).getUTCDay() + 6) % 7;
      const next = addDays(d, e.key === "Home" ? -dow : 6 - dow);
      if (monthKeyOf(next) === monthKeyOf(d)) { setFocused(next); cells.current.get(next)?.focus(); }
    }
  }, []);

  const isRestricted = (m: MonthKey) => props.restrictedMonths.includes(monthNumber(m));

  const canPrev = !props.minMonth || month > props.minMonth;
  const canNext = !props.maxMonth || shiftMonth(month, shown - 1) < props.maxMonth;

  return (
    <Box onMouseLeave={() => setHover(null)}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <IconButton size="small" aria-label="Previous month" disabled={!canPrev} onClick={() => props.onMonthChange(shiftMonth(month, -1))}><ChevronLeftIcon /></IconButton>
        <Typography variant="body2" color="text.secondary" aria-live="polite" sx={{ textAlign: "center", px: 1, minHeight: 20 }}>
          {rangeStart && rangeEnd
            ? <><b>{formatRange({ start: rangeStart, end: rangeEnd })}</b> · {previewDays} working day{previewDays === 1 ? "" : "s"}{picking ? " — click the end date" : ""}</>
            : onSelect ? "Click a start date, then an end date" : ""}
        </Typography>
        <IconButton size="small" aria-label="Next month" disabled={!canNext} onClick={() => props.onMonthChange(shiftMonth(month, 1))}><ChevronRightIcon /></IconButton>
      </Stack>
      <Stack direction="row" spacing={{ sm: 3, md: 4 }}>
        {months.map((m) => {
          const info = props.occupancy[m];
          const own = !!props.ownMonths?.has(m);
          const restricted = isRestricted(m);
          return (
            <MonthGrid
              key={m} month={m} today={props.today} holidays={holidays} restricted={restricted}
              full={!restricted && !!info && info.count >= info.capacity && !own} info={info} own={own}
              layers={props.layers} showDraft={props.showDraft} rangeStart={rangeStart} rangeEnd={rangeEnd}
              focused={months.includes(monthKeyOf(focused)) ? focused : `${months[0]}-01`}
              interactive={!!onSelect || !!props.onRestricted}
              onDayClick={click} onDayHover={setHover} onKey={onKey}
              registerCell={registerCell}
            />
          );
        })}
      </Stack>
      {!props.hideLegend && <CalendarLegend showDraft={props.showDraft} />}
    </Box>
  );
}

/* -------------------------------- year glance ------------------------------ */

/** Twelve-month overview: capacity per month and the employee's days, clickable to navigate. */
export function MonthStrip(props: {
  year: number;
  occupancy: Record<MonthKey, MonthInfo | undefined>;
  restrictedMonths: number[];
  myDays?: Record<MonthKey, number>;
  myLabel?: string;
  current?: MonthKey;
  onPick?: (m: MonthKey) => void;
  ownMonths?: Set<MonthKey>;
}) {
  // Columns follow the strip's own width (container queries), not the window: the same strip sits in
  // full-width cards (dashboard) and narrower columns (annual plan) without squeezing or overflowing.
  return (
    <Box sx={{ containerType: "inline-size" }}>
    <Box sx={{
      display: "grid", gap: 1, gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      "@container (min-width: 420px)": { gridTemplateColumns: "repeat(4, minmax(0, 1fr))" },
      "@container (min-width: 600px)": { gridTemplateColumns: "repeat(6, minmax(0, 1fr))" },
      "@container (min-width: 1080px)": { gridTemplateColumns: "repeat(12, minmax(0, 1fr))" },
    }}>
      {Array.from({ length: 12 }, (_, i) => {
        const m = monthKey(props.year, i + 1);
        const info = props.occupancy[m];
        const restricted = props.restrictedMonths.includes(i + 1);
        const mine = props.myDays?.[m] ?? 0;
        const full = !restricted && !!info && info.count >= info.capacity;
        const selected = props.current === m;
        return (
          <ButtonBase
            key={m}
            onClick={() => props.onPick?.(m)}
            disabled={!props.onPick}
            aria-pressed={selected}
            aria-label={`${monthLabel(m)}: ${restricted ? "restricted" : `${info?.count ?? 0} of ${info?.capacity ?? "?"} employee slots used`}${mine ? `, ${mine} ${props.myLabel ?? "days"}` : ""}`}
            sx={{
              display: "flex", flexDirection: "column", alignItems: "stretch", textAlign: "left", p: 1.25, gap: 0.75, borderRadius: 2, minWidth: 0,
              border: 1, borderColor: selected ? "primary.main" : "divider", bgcolor: restricted ? "leave.restricted" : "background.paper",
              boxShadow: selected ? (t: Theme) => `0 0 0 1px ${t.vars!.palette.primary.main}` : "none",
              backgroundImage: restricted ? "repeating-linear-gradient(135deg, rgba(127,127,127,.10) 0 2px, transparent 2px 6px)" : undefined,
              transition: "border-color .15s", "&:hover": { borderColor: "primary.main" }, "&.Mui-disabled": { opacity: 1 },
            }}
          >
            <Stack direction="row" spacing={0.5} sx={{ justifyContent: "space-between", alignItems: "center", minWidth: 0 }}>
              <Typography variant="caption" noWrap sx={{ fontWeight: 700, letterSpacing: "0.02em" }}>{MONTH_NAMES[i].slice(0, 3)}</Typography>
              {restricted ? <LockOutlinedIcon sx={{ fontSize: 13, color: "text.disabled", flexShrink: 0 }} />
                : full ? <Typography variant="caption" noWrap sx={{ fontWeight: 700, color: "error.main", fontSize: 10.5, flexShrink: 0 }}>FULL</Typography> : null}
            </Stack>
            {restricted ? (
              <Typography variant="caption" color="text.disabled" sx={{ lineHeight: "8px", fontSize: 10.5 }}>Restricted</Typography>
            ) : (
              <CapacityPips count={info?.count ?? 0} capacity={info?.capacity ?? 5} own={props.ownMonths?.has(m)} size={7} />
            )}
            {props.myDays && (
              <Typography variant="caption" sx={{ fontWeight: mine ? 700 : 400, color: mine ? "primary.main" : "text.disabled", fontVariantNumeric: "tabular-nums" }}>
                {mine ? `${mine} ${props.myLabel ?? "days"}` : "—"}
              </Typography>
            )}
          </ButtonBase>
        );
      })}
    </Box>
    </Box>
  );
}
