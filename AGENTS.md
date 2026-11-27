# AGENTS.md (mobile)

Guidance for coding agents in the JouleOps mobile app (Expo / React Native, expo-router, NativeWind).
The full working rules and system notes live in the workspace [CLAUDE.md](../CLAUDE.md); read it first.

## Design process (every UI build or redesign, in this exact order)

1. **Design system:** use the `ui-ux-pro-max` skill to generate a complete design system and save it
   in the project. For existing screens, extend and record the app's current theme instead of
   inventing a competing system. A supplied design file is still the UI truth.
2. **Design plan:** use the `frontend-design` skill to write a plan that works within that design system,
   check it against the brief, and apply it to every screen. Keep all numbers and small text highly readable.
3. **Critique and polish:** once built, run `/impeccable critique`, fix what it finds, then run `/impeccable polish`.
4. **Guidelines review:** use the `web-design-guidelines` skill on every screen and fix all high and medium
   severity issues (skip web-only rules that don't apply to React Native).
5. **Screenshots:** screenshot every screen on the emulator or a device at **phone width (~390dp)** and
   on a **tablet** (`supportsTablet` is on), fix every layout problem, and confirm each fix with new
   screenshots.

Requirements: React Native with NativeWind, and every screen fully responsive. Use realistic sample data
so every screen looks populated in mockups and empty dev states only; screens wired to the backend show
real API data, never shipped fakes. Work autonomously and test the app yourself before declaring
completion. Don't stop at a mockup or partial prototype.

If a named skill or command isn't available in your tool, follow the step's intent by hand and say so in
your report.
