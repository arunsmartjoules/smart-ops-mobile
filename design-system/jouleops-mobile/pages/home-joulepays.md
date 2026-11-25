# Home at a JoulePays site ("the billing month")

Home (`app/(tabs)/dashboard.tsx`) switches its body when the selected site is not JouleCool
(`isJouleCoolSite`). Code: [components/home/JoulePaysHome.tsx](../../../components/home/JoulePaysHome.tsx),
rules in `utils/joulePaysHome.ts` (tested), data in `services/JoulePaysHomeService.ts`. Theme: [MASTER.md](../MASTER.md).

## The subject

A JoulePays site is paid from what it saves against its baseline, over its billing month (APLINDR: 8th
to 7th). Home answers what the web Trend Sheet overview answers: are we beating the target this
billing month, and is today's round entered. Tickets, SLA and plant efficiency are not shown here.

## The one memorable thing: the billing-cycle strip

The hero draws the billing month as one bar per day (Electricity saving %), the month's target as a
line, today as an accent ring with a dot under it, a missed day as a red hollow box, days to come
as faint dots. A key under the strip names only the kinds of day it shows. Above the line = on
target, so colour is never the only signal (with no positive target there is no line, and every
entered day with a saving reads "On target").

```
Electricity saved this billing month
−10.91 %                         −64,456 kWh
Used more than the baseline so far
5%                                 Target 20%
▂ █ ▁ ▁ ▁ ▁ … █ ▁ ▢ · · · · · · · · · · ·
■ On target  ▬ No saving  ▢ Today, to enter
8 Nov            Day 18 of 30           7 Dec
✓ 17 of 18 days entered                    ›
```

## Order

1. Technicians: the attendance card (ShiftHero, no SLA tag).
2. The billing month (opens Ops › Trend Sheet › Month). Needs `trend_sheet_entry`.
3. Month so far (roles with `trend_sheet_dashboard` only, never rupees for others): All energy saved
   and Revenue side by side, each with a bar to target, then Electricity yesterday, Mcal saved,
   provisional / incomplete day notes. Up to yesterday, from `GET /api/trend-sheet/dashboard`.
4. Today's round: one row per category, the next carries the accent "Enter".

Dashboard-only roles get the month's Electricity figure without the strip (the day list is an entry route).

## Rules

- The month figure is not floored (only a day's % is), so a loss shows its % like a gain.
- With a target set, the line under the figure is always the gap to it, a loss included (APLINDR plans a
  negative Electricity target); "Used more than the baseline so far" only when no target is set. Red
  still means a loss, as on every trend sheet screen.
- The strip speaks one summary ("2 days on target, 15 days with no saving, …", `stripSummary`), also
  inside the card's label. Its scale label sits on a hairline at the strip's top.
- Before a technician starts the day, the round says "Start your day to enter readings." under its header.
- A day floored to 0 % reads "No saving", never on target.
- Today not yet entered is not a miss.
- Pages by Project Type (`trend_sheet_entry` / `trend_sheet_dashboard`, JoulePays column) hide parts.
- Offline: last good answer per user + site + month (AsyncStorage `joulepays_home:v1:`), with a
  "No connection" line; a 4xx is shown as an error, never covered by the cache.
