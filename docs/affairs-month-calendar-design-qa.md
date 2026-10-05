# Affairs month calendar — design QA

Source: `docs/assets/affairs/month-calendar-selected.png`, 1488×1058.
Implementation: isolated actual-component harness at `http://127.0.0.1:4181/affairs?view=calendar&month=2026-10`; no database connection or product mock fallback.
Desktop viewport 1488×1058, mobile 390×844; CSS pixels at density 1. Full-page desktop-before capture is 1488×1591; compare identical width and document sections, and classify the above-fold height difference rather than treating the taller capture as a scale difference.
Evidence: `docs/assets/affairs/month-calendar-desktop-before.jpg`, `docs/assets/affairs/month-calendar-mobile-before.jpg`. Source and desktop implementation opened together in one tool input.

## First comparison — blocked

- [P2] Spacing/density: large summary margins and 52px empty point row push most month rows below the fold, unlike the compact selected concept. Reduce workbench-only summary rhythm and point row to 28px, empty week minimum to 82px.
- [P2] Typography/contrast: calendar 12px labels are harder to scan than the source; improve date and point size, and use dark text on the muted green range tone. The concept's project color assignment is illustrative, not a semantic hardcoded mapping.
- [P2] Tokens: new toolbar uses undefined `--border`, so border affordances disappear. Use existing `--divider`, accent selected calendar mode.
- [P2] Heatmap weekdays overflow their fixed row tracks and produce an unnecessary vertical scrollbar. Explicit line height and vertical overflow clipping with padding for focus ring.

Source's date endpoints contain known errors; actual range endpoints follow the approved spec, not those pixels. Existing global header/shell sizes are intentionally retained. Dynamic counts and heatmap reflect fixture records, not the design image's sample counts.

Required surfaces: fonts use existing system family (Chinese Microsoft YaHei fallback), date/point scale needs above fix; spacing needs above fix; warm dark tokens retained with above fixes; no photo/logo raster assets in source, existing Tabler icons appropriate; copy has no added giant title, mainline labels, week mode or legend.
Mobile: seven columns and readable selected-day list, width=scrollWidth=390. No mobile source image exists; assessed against approved responsive spec.

## Second comparison — passed

Updated source and final desktop opened together at original image detail. Final evidence: `docs/assets/affairs/month-calendar-desktop.jpg` (1473×1165 full page), `month-calendar-tablet.jpg` (753×1165), `month-calendar-mobile.jpg` (390×1351), `month-calendar-confirmation.jpg`.
CSS viewports: 1488×1058, 768×1024, 390×844, density 1. In-app browser viewport-only screenshots clip to its physical host height; full-page capture was used. Desktop/tablet width excludes a 15px scrollbar. Images were not rescaled; compare same CSS-scale content, not the extra footer height. Source is 1488×1058 at the same scale.

Earlier P2 fixes: workbench-only summary/shell spacing reduced; point rows 28px only where needed; empty week minimum 82px; deterministic first-free per-week lanes reclaim ended projects' tracks; calendar date/point labels 14px and range labels 13px; dark range text contrasts with olive fill; divider token and selected accent restored; weekday line height avoids heatmap vertical scrollbar. Final month grid and complete ranges are readable, with all five weeks visible in the full-page capture. Source's incorrect endpoints were deliberately not reproduced.

Required surfaces rechecked:
- Typography: existing system family/fallback, medium metrics, 14px dates/point items; long tablet text truncates and opens full labeled details. Existing global navigation is smaller than the concept, retained for app consistency.
- Spacing/layout: one full-width month, compact heatmap, no sidebar/giant title; actual range endings align to their day cells. Existing 84px app header and footer padding explain residual document-height differences.
- Tokens: existing warm-dark palette, accent selected mode, sand/olive/orange stable resource tones, visible keyboard focus. Colors are not hardcoded by project name.
- Assets: no source photographic/illustrated assets; existing Tabler standard UI icons, no invented raster/vector decorative substitutes.
- Copy: only actionable toolbar/metrics/date/detail copy; no mainline, week view, legend or removed explanatory headings in calendar.

Focused region: original-detail combined full captures make dates/checkboxes/times/range endpoints legible; separate crops unnecessary. Mobile and tablet have no source mock; judged against responsive spec. Width equals document scrollWidth (390 and 768); heatmap alone scrolls horizontally on mobile. Mobile has full readable selected-day items and date-range project entries.

Interactions checked in isolated fixtures: next/today/back/forward, full project details and Escape, task completion confirmation, unknown request blocked Back and original retry produced replay receipt, +N complete day list, unscheduled entry, blank day prefilled date without save. Unit tests cover dirty/pending controls and frozen UUID refresh. Console: three transient duplicate-createRoot warnings from harness hot reload, none attributed to product components; clean-load fresh tab had zero error/warn logs. Production auth/database not tested before user-run migration.

Residual P3: sample content/palette assignments differ from concept by actual resource ID and data. Expected, not an outstanding product fix.

final result: passed

Post-review interaction regression: details → completion now switches to one dialog rather than stacking two. Actual browser Escape restored body overflow and original task focus, with zero error/warn logs. Ranged deadline time now renders only on its deadline day/final weekly segment; focused component regressions cover early dates, deadline dates, cross-week segments and retained detail time. Deferred minor: Today does not reselect the date when the displayed month is already current; manual date selection remains available.
