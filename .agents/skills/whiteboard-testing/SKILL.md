---
name: whiteboard-ui-testing
description: Run local worksheet and Desmos UI checks without AI provider credentials.
---

# Whiteboard UI testing

Run `pnpm dev` and open
`${_repo_secret_JoelGrayson/HackMIT2026_BETTER_AUTH_URL}/dev/whiteboard?subject=math&sheet=sample`.
The Math subject exposes Graph; Chemistry does not. The bundled PDF can render
even when printed-problem extraction fails.

Use a real pen stroke before toggling the Graph side-rail button. The same
button returns to the mounted worksheet. Enter an expression such as `y=x^2`
in Desmos to distinguish a functioning calculator from a blank layout shell.
Compare worksheet ink before and after toggling.

The Next.js development indicator may overlap the bottom-left Graph button.
Use its Preferences → Hide Dev Tools for this session rather than changing
application code.

## Devin Secrets Needed

None for PDF rendering, manual drawing, or manual Desmos plotting: Desmos has
a public development key fallback. External access to www.desmos.com is needed.

Handwriting recognition requires `MATHPIX_APP_ID` and `MATHPIX_APP_KEY`.
Warnings may still occur after drawing in "Check when I'm done" mode; do not
assume that mode disables recognition requests. Report these limitations
separately from canvas-layout results. AI tutor/voice tests require their own
provider credentials documented in `.env.example`.
