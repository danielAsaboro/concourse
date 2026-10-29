# Concourse design system

Calm, precise, operational. Type and white space carry the hierarchy; colour is kept for one accent and the crowd-fit scale. Tokens live in `app/globals.css` (`:root` and `:root[data-theme="dark"]`).

## Type
Geist (400 text, 500 labels, 600 headings and numbers, 700 landing headline only); Geist Mono only for endpoints, stand IDs and the evidence log. Tabular figures wherever numbers line up.
Scale: Display 72/76 · Title 1 40/48 · Title 2 28/36 · Title 3 20/28 · Headline 15/20 · Body 15/24 (landing lede 21/32) · Label 13/16 · Caption 12/16 · KPI 40/44.

## Space and layout
8pt grid (4 only inside controls). Landing: 1200px content, 40px margins (16 on phones), 128px between sections (80 on phones). Dashboard: 248px sidebar (72px rail under 1280px, bottom tab bar under 760px), 56px top bar, 32px content padding, 384px right dock for the stand inspector and agent; evidence is a 480px sheet. Radii: 6 chips, 8 controls, 12 cards, 16 sheets.

## Colour
Palette "Floodlight" (2026-10-15, chosen from Dribbble sports-dashboard work and built on Coolors: coolors.co/0f110c-1c2117-d7ff3a-ff6a2b-f2f0e8): onyx #0F110C, carbon #1C2117, lime #D7FF3A, tangerine #FF6A2B, linen #F2F0E8. Warm linen neutrals in light, olive-black in dark. Lime is only ever a fill with onyx text (`--fill`); primary buttons and the active nav item use `--btn` (onyx with lime text in light, lime with onyx text in dark). Text-safe accent `--accent` is deep moss #3D5A00 in light and lime in dark. Tangerine (`--hot`) marks change and live state. Five-step crowd-fit ramp runs from neutral to moss/lime (`--fit-0`…`--fit-4`); ok/warn/bad only for state. The closing landing band is always dark. All text pairs pass WCAG AA (4.5:1). Vendor colours appear only on kiosk signs in the 3D scene.

## Material (Liquid Glass, 2026-10-15)
Apple-style Liquid Glass over a fixed wallpaper of soft lime/tangerine light (`--wall`). Cards, sidebar, toolbar and dock are translucent glass (`--glass`, `--glass-strong`, near-opaque `--glass-bar` for the toolbar) with an inset specular edge (`--glass-spec`), inner glow (`--glass-glow`) and layered depth (`--glass-depth`). Sidebar, toolbar and inspector float with 12px margins and 22–26px radii. Primary buttons are gel capsules; the crowd-fit KPI is a lime gel tile. SF Pro first, SF Pro Rounded for big numbers. `prefers-reduced-transparency` falls back to solid surfaces.
Never use `backdrop-filter` or CSS `mask` on in-page elements (sticky bars, cards, buttons, anything near the 3D canvas): over the WebGL canvas Chromium stops painting the page. Real lens blur is only for popovers (menus, sheets, toasts, scene tooltips) and the phone tab bar.

## Rules that are part of the design
- Synthetic data always shows "Demo data (synthetic)" (top bar, evidence rows).
- Per-cap lift always carries the "Inference" tag.
- Driver scores are relative bars and words, never percentages. The UI writes its own placement reason and scrubs driver percentages from agent text.
- Qloo is named in two places only: the evidence sheet and beside the crowd-fit KPI.

## 3D arena (components/arena)
Two-tier oval bowl (instanced seats, aisles), lower and upper concourses, club lounge, facade fins, rim lights. Stands are kiosks with a lit fascia sign and roof in the vendor's colour; merch stores sit at the gates, sponsor tents on the plaza. Light theme is a daylight model; dark theme is event night. Hover lifts a kiosk, selection rings it and opens an in-scene swap popover; swapping flips the sign.
