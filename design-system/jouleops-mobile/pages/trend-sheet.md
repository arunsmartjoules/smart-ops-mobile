# Trend sheet: module design ("the meter book")

A fresh design for the Ops › Trend Sheet module: the day page (hub), the Electricity, DG and fuel entry
screens, the day summary and the month. It follows the app theme in [MASTER.md](../MASTER.md) (carbon
surfaces, the user's accent, Bricolage Grotesque and Geist, the `ok`/`warn`/`bad` tones), and it
replaces the earlier layout of hero card plus a stack of identical cards.

Code: [components/trend/TrendKit.tsx](../../../components/trend/TrendKit.tsx), `app/(tabs)/trend-sheet.tsx`,
`app/trend-*.tsx`.

## The subject

A technician walks a round of meters with a phone, often in a dim plant room, and copies each dial
into the app. The paper they replaced was a meter book: one page per day, one line per meter,
yesterday's figure above today's. The expensive mistakes are a wrong digit, a slipped decimal point
and the wrong day. Managers glance at the day and the month to see the saving against target.

So the design is a meter book. A day is a page, a category is a line in today's round, and a reading
is written directly under yesterday's.

## Reading fields (revised 2026-11-25)

The first build drew readings as digit cells. The user rejected it: separate boxes read as an OTP
input. A reading is now one plain field:

```
             Yesterday                    18,239.07  kVAh
             ┌──────────────────────────────────────────┐
             │ Today                      18,242.50  kVAh │
             └──────────────────────────────────────────┘
                          +3.43 × 6,000 = 20,580 kVAh
```

- Yesterday's reading sits directly above today's field, same size (22, tabular) and the same right
  edge (the unit column is a fixed width), so the two figures compare by eye.
- The label is inside the field on the left; tapping anywhere on the field starts typing.
- While typing the field shows the digits as typed; once left, it shows them grouped (18,242.50).
- The worked line under it (`+3.43 × 6,000 = 20,580 kVAh`) is the arithmetic check, and turns amber
  with the "check the decimal point" line when one meter uses more than twice the day's baseline.
- DG and fuel quantities use the same field, with a calculated value drawn quieter (`ink3`) and
  labelled "calculated".

Code: [components/trend/ReadingField.tsx](../../../components/trend/ReadingField.tsx).

## Tokens (from the app theme, no new colours)

| Role | Token | Use here |
|---|---|---|
| Page | `page` | Background |
| Sheet | `card` | The day page, the round, the ledger |
| Raised | `raised` | Chips, idle controls |
| Ink | `ink` / `ink3` / `muted` | Today's digits / yesterday's digits / labels |
| Accent | `accent` / `accentInk` / `accentTint` | Changed digits, the next step, primary actions |
| Status | `ok` / `warn` / `bad` + tints | Saving tone, past-day warning, refusals, always with words |

Type: Bricolage Grotesque for the day title and the saving figure; Geist for labels, copy and
figures (tabular, 12 is the floor); Geist Mono only for the ledger's operators.

Shape: sheets radius 24, fields radius 14, chips 999.
Spacing: 4, 8, 12, 16, 24.

## Screens

```
Day page (hub)                          Entry (Electricity)
┌──────────────────────────────────┐    ┌──────────────────────────────────┐
│ site · PM | Trend Sheet          │    │ ‹  Electricity          today    │
│ Wed, 25 Nov             [Month]  │    │ [Electricity] [DG] [PNG]         │
│ Today                            │    │ Base 35,588.17 kVAh · Tgt −2.9%  │
│ T F S S M T [W]   ● ● ● ● ● ● ○  │    │                                  │
│                                  │    │ Main Block                × 6,000│
│ Saved so far           2.38 %    │    │  Yesterday          18,239.07 kVAh│
│ 848 kVAh of 35,588 baseline      │    │  [Today             18,242.50 kVAh]│
│ 0 ━━━━━━━━━━━│━━━━━━━━━━ 5 %     │    │  +3.43 × 6,000 = 20,580 kVAh     │
│                 target           │    │  No adjustment                 › │
│ Today's round       1 of 3       │    │ Madhura Block ...                │
│ ① Electricity  2 meters   34,740 │    │──────────────────────────────────│
│ ② DG           Main       Enter  │    │ Saved today  848 kVAh   2.38 %   │
│ ③ PNG          Main          ›   │    │ 0 ━━━━━━━│━━━━━ 5 %             │
└──────────────────────────────────┘    │ [        Save electricity      ] │
                                        └──────────────────────────────────┘
DG / fuel                              Summary (the day's ledger)
┌──────────────────────────────────┐    ┌──────────────────────────────────┐
│ Did the DG run today?            │    │ Electricity                      │
│ [   Ran   ] [ Did not run ]      │    │    Baseline           35,588.17  │
│ Main Block          1 L = 3.2 kWh│    │ −  Meters (2)         35,520.00  │
│  [Diesel used            42.5   L]│    │ −  DG                      0.00  │
│  [Units, calculated      136  kWh]│    │ +  Adjustment              0.00  │
└──────────────────────────────────┘    │ =  Saved      68.17 kVAh  0.19 % │
                                        │ 0 ━│━━━━━━━━━━━━━ 5 %           │
Month                                   │ 1,100.23 kVAh above the target   │
 ‹  November 2026  ›  8 Nov – 7 Dec     └──────────────────────────────────┘
 −10.91 %   −64,456 kWh   17 of 18 days
 calendar: each day a cell with its saving %, on target tinted, below target outlined,
 no saving neutral, not entered dashed; tap opens the day's ledger
```

- **Day page:** the day is a sheet, not a hero card. The categories are "today's round": numbered,
  because the order is real (Electricity first, then DG, Solar and Wind, which change it, then
  fuels). They sit as rows of one sheet. A done row shows what was entered in tabular figures, the
  next one carries the accent "Enter", the rest a chevron.
- **Entry:** meter cards hold yesterday's reading, today's field and the worked line (`+3.43 × 6,000 = 20,580 kVAh`).
  Adjustments stay one tap away in the sheet. The footer is the saving and the Save button.
- **DG and fuels:** the question comes first ("Did the DG run today?" / "Used PNG today?") as a
  two-way choice, so "none" is an answer, never a blank field. Quantities use the same plain field
  without a reference row. A calculated value is drawn quieter and labelled "calculated"; typing over
  it makes it a typed value.
- **Summary:** a ledger, not a card of label/value rows. The operators make the arithmetic visible
  (baseline − used + adjustment = saved), and the equation is drawn only when the stored figures
  really add up. A hand-typed saving, or rounding that does not close, falls back to plain rows.
- **Month:** stepper row, month result, calendar. Days floored to 0 % by the server read "No
  saving", never "on target".

## Behaviour kept from before

Validation and its wording, carry forward, the skipped-day block, offline saving and the sync line,
delete, the decimal-slip warning, the leave-without-saving check (button, Android back key, no iOS
swipe), the 672 readable column on tablets, the zoomed gauge scale (`gaugeScale`, floor 5 %).

## Principles

1. The reading is checked against yesterday's, digit by digit, before it is saved.
2. Every figure that is compared is tabular and right-aligned on the decimal point.
3. Colour never carries meaning alone: every tone has a word or a shape.
4. One accent action per screen: the next step on the day page, Save on an entry screen.
5. No eyebrows, no all-caps labels, no decorative cards: a surface exists because it groups something.
