/**
 * Shape scale and surface shadow shared across the DS screens.
 *
 * This module used to hold the pre-redesign home screen's building blocks
 * (OverviewHeader, IdentityCard, SectionHeading, OverviewRow, OverviewEmpty,
 * plus the BADGE/TINT maps). Those were superseded by components/home/HomeUI
 * and had no remaining references, so they were removed when the app gained a
 * dark palette rather than being carried forward against a static light one.
 */

/** r = 12, rSm = round(r * 0.7), rTile = round(r * 1.4). */
export const soRadius = { card: 12, sm: 8, tile: 17, pill: 99 } as const;

/**
 * surfaceStyle "Soft" → 0 1px 3px rgba(25,19,18,.08).
 *
 * Literal rather than a token: this is spread into stylesheets across the app,
 * and it must stay a DARK shadow in both themes — on the dark palette it
 * simply goes invisible against the near-black ground, which is correct.
 * Dark cards get their separation from `cardBorder` instead.
 */
export const soShadow = {
  shadowColor: "#191312",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.08,
  shadowRadius: 3,
  elevation: 2,
} as const;
