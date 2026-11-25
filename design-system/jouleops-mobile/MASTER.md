# JouleOps mobile: design system (master)

This file records the design system the app already ships. The tokens live in code, and the code wins
when the two disagree:

- Tokens: [constants/jo.ts](../../constants/jo.ts) (palette, accents, fonts)
- Primitives and type helpers: [components/jo/ui.tsx](../../components/jo/ui.tsx) (`f.d`, `f.t`, `f.m`, `Card`, `PrimaryButton`, `JoSheet`, …)
- Origin: the Claude Design artboard "JouleOps App.dc.html" (carbon redesign, October 2026)

Page-specific rules live in [pages/](pages/) and override this file for that page.

## Look

A carbon canvas with one accent colour the user picks. The canvas is near-black in dark mode and
off-white in light mode. Cards are flat surfaces with a hairline border and no shadow. The only
shadow-like effect is the accent glow on primary buttons and the page's top-right glow.

| Role | Dark | Light | Token |
|---|---|---|---|
| Page | `#0A0A0C` | `#F4F4F6` | `page` |
| Card | `#141418` | `#FFFFFF` | `card` |
| Raised control / field | `#1C1C22` | `#F0F0F3` | `raised` |
| Primary text | `#F4F4F6` | `#0A0A0C` | `ink` |
| Secondary text | `#8A8A96` | `#6B6B76` | `muted` |
| Accent | user's pick (flame, lime, violet, mint, sky, rose, amber, thunder) | deeper step for text | `accent` / `accentInk` |
| Good / warning / bad | `#5EEAD4` / `#FBBF24` / `#FF6B57` | `#0B8F7E` / `#B77900` / `#E0442F` | `ok` / `warn` / `bad` |

Rules:
- Use tokens only. No hex values in screens.
- Status colour never stands alone: every tone comes with words, an icon or a shape.
- `faint` (`#5A5A66`) is for placeholders and dates that have not happened yet, never for information
  someone needs to read.

## Type

- Display: Bricolage Grotesque (`f.d`). Sizes above 20 are compressed by `displaySize`, so pass the
  artboard size.
- Text: Geist (`f.t`). Never pair a family with `fontWeight`, because Android drops the face.
- Mono: Geist Mono (`f.m`). Codes and IDs only, not figures.
- Smallest text: 12. Body text: 14 to 16. Line height is about 1.4 on anything that wraps.
- Every figure that changes or is compared (readings, savings, baselines) uses tabular figures
  (`fontVariant: ["tabular-nums"]`), so digits don't jump while someone types.

## Layout and touch

- Gutter 16, card padding 16 to 20, gap scale 4, 8, 10, 12, 16, 24.
- Card radius: 20 to 28 for cards, 14 to 18 for fields and cells, 999 for pills and buttons.
- Touch targets are at least 44 high. Primary buttons are 52 to 54.
- One primary (accent) button per screen. Destructive actions are red text buttons, kept away from
  Save.

## Behaviour

- Sheets: `Modal animationType="slide"` with plain Views. Never put Reanimated `entering`/`exiting`
  inside a Modal (Android stops taking taps; guarded by `__tests__/noModalLayoutAnimations.test.ts`).
- Haptics: success on save, warning on a refused save.
- Offline first: a screen shows what is on the phone at once and marks it when it is stale.
