# Primitives

Location: project root, single package.
Status is `confirmed` or `inferred`; `pending` marks code not yet on the integration branch, with the branch name when one exists.

## model

- **`Lot`**, `src/model/types.ts`, confirmed
  The single reference frame of the plan, with street sides and boundary walls. Contract: `{ width, depth, frontSide, cornerSide (adjacent to frontSide, or null), boundaryWalls: Record<Side, boolean>, sidewalkWidth, northDeg, ground: Fill, frontage }`, integer mm, origin at the lot top-left, x right, y down; `northDeg` is true north, clockwise from screen up; `frontage` is [[PRIMITIVES#Frontage]].
  Consumers: >=5 (FrontageGeometry, ContextGeometry, SunLayer, item select `clampToLotBox`, AreaOps `clampToLot`); planned: LotLayer, WallDerivation, Snapper, export layout, LotWizard, LotInspector.
- **`Frontage`**, `src/model/types.ts`, confirmed
  The sidewalk items on the street sides of the lot. Contract: `{ ramps: SidewalkRamp[], trees: StreetTree[] }`; `SidewalkRamp { id, side, at, width, gateId }`, where `at` is the center along the lot side, `width` includes the flares, and `gateId` is the vehicle gate the ramp follows, null after a manual edit; `StreetTree { id, side, at, size, species }`, where `at` is the trunk along the side and `size` is the canopy diameter. The rules live in [[PRIMITIVES#FrontageGeometry]].
  Consumers: >=3 (FrontageGeometry, ContextGeometry, street-tree and sidewalk-ramp select handlers).
- **`Area`**, `src/model/types.ts`, inferred
  The unit that users draw, name, paint and measure; walls derive from it. Contract: `{ id, kind: 'room' | 'covered' | 'outdoor', preset, name, shape, fill, labelOffset }`; shape is rectilinear integer-mm rings, outer ring with positive signed area; `covered` builds no wall to the outside; `outdoor` never builds walls and is never carved.
  Consumers: ? (planned: WallDerivation, AreaOps, render layers, AreaInspector, paint tool, export).
- **`Opening`**, `src/model/types.ts`, inferred
  A door, window or gate that cuts a host wall, with hinge and swing. Contract: `{ id, type, axis, line, at, width, height, sill, hinge, side }`; the host wall run resolves at derive time; an opening without a host renders red with a warning and is never deleted silently.
  Consumers: ? (planned: WallsLayer, OpeningsLayer, opening tool, OpeningInspector, AreaOps, export).
- **`Item`**, `src/model/types.ts`, inferred
  A free catalog object (furniture, fixture, car, tree, pillar) on its own layer. Contract: `{ id, type, variant, x, y, w, d, rotation, color, label, mirrored }`; enters boolean ops only as its axis-aligned box ([[PRIMITIVES#RectilinearGeometry]]).
  Consumers: ? (planned: ItemsLayer, item tool, Snapper, net area (pillars), label placement, ItemInspector, export).
- **`Ruler`**, `src/model/types.ts`, inferred
  A user-placed fixed measurement. Contract: `{ id, mode: 'free', a, b } | { id, mode: 'fit', origin, axis }`; `fit` re-resolves wall face to wall face on every derive, with house walls and the lot wall as obstacles.
  Consumers: ? (planned: RulersLayer, ruler tool, RulerInspector, plan checks, export).
- **`Units`**, `src/model/units.ts`, inferred
  The integer millimetre policy plus pt-BR format and parse for every label and input. Contract: `toMm, formatLength, formatArea, formatCm, formatOpening, parseMeters, roundMm`; area rounds half up on integer mm²; parse accepts comma and dot.
  Consumers: ? (planned: all labels, MeasureInput, LotWizard, inspectors, export title block).
- **`ProjectCodec`**, `src/model/codec.ts` (+ `migrate.ts`, `schema.ts`), inferred
  The versioned persistence contract for storage, files and share links. Contract: `serializeProject(doc)`, `parseProject(text, { newId }) -> { doc, repairs }` or `CodecError` with a pt-BR `userMessage`; `format: 'casinha.project'`, integer `schemaVersion` with sequential migrations; a newer version is rejected; import always creates a copy.
  Consumers: ? (planned: repository, projectFile, shareLink, templates).

## catalog

- **`ItemDef`**, `src/catalog/types.ts`, registry `src/catalog/registry.ts`, inferred
  A parametric top-view symbol per item type, with defaults, variants, limits and wall-snap behavior. Contract: `defineItem({ type, label, category, keywords, size, min, max, variants?, wallSnap, layer, color, colorable, keepAspect?, Symbol })`; `Symbol({ w, d, color, ctx })` draws centered at (0,0) with the back side at `-d/2`; unknown types use `generic-box`; the registry is the canonical list, built with `import.meta.glob`. An axis whose `min` equals its `max` is fixed: the item cannot resize on it, and `withFixedSize(item)` (`src/editor/select/item.ts`) puts it back to the catalog value, so every path that makes an item copy (paste, duplicate, drag base) calls it.
  Consumers: >=3 (item select, shortcuts, ItemInspector through `fixedSize` and `withFixedSize`); planned: ItemsLayer, CatalogPanel, Snapper.
- **`OpeningDef`**, `src/catalog/openings/*.tsx`, inferred
  An opening symbol drawn in the wall gap, with host compatibility and size presets. Contract: `defineOpening({ type, label, group, hosts, widths, defaultWidth, height, sill, minWidth, maxWidth, hasSwing, tip, Symbol })`; windows host only on external walls, gates only on the lot wall.
  Consumers: ? (planned: OpeningsLayer, OpeningsPanel, opening tool, OpeningInspector).
- **`MaterialDef`**, `src/catalog/materials/*.tsx`, inferred
  A floor fill as a true-scale SVG pattern, valid on screen and in SVG, PDF and PNG export. Contract: `defineMaterial({ id, label, group, permeable, defaultColor, tile, Pattern, flatColor })`; `Pattern` returns a `<pattern patternUnits="userSpaceOnUse">` in mm with hex colors only; `solid` is the default when an id is unknown.
  Consumers: ? (planned: PatternDefs, AreasLayer, FillPicker, PaintPanel, totals (permeable area)).
- **`RoomPreset`**, `src/catalog/roomPresets.ts`, inferred
  Room types with default name, kind, fill and soft rules. Contract: `ROOM_PRESETS: Record<RoomPresetId, { label, kind, fill, icon, minArea?, needsWindow?, doorWidth? }>`, `presetFor(id)`.
  Consumers: ? (planned: build tool type picker, AreaInspector, factories, opening tool, plan checks, templates).
- **`WallPreset`**, `src/catalog/wallPresets.ts`, confirmed
  Common Brazilian wall builds, with their finished thickness and the wall kinds they apply to. Contract: `WALL_PRESETS`, `wallPresetsFor(kind)`, `wallPresetFor(id, kind)` (null when the id is unknown or does not apply to the kind), `resolveWallChoice(kind, thickness, stored) -> WallPresetId | 'custom'` (the stored choice while it matches the thickness, else the first preset with that thickness, else custom), `WALL_CUSTOM_RANGE` 50 to 400 mm. The choice is stored per wall kind in `Structure.wallPresets`, where null derives it from the thickness; on load the codec keeps a stored id only when it applies to its kind and matches its thickness. Write a wall kind thickness only through `commitWallThickness(kind, mm, choice)` in `src/ui/controls/WallThicknessPicker.tsx`: in one undo step it rounds to whole cm, stores the choice and recomputes `Structure.preset`.
  Consumers: >=5 (WallThicknessPicker, codec, LotInspector, WallInspector, SettingsDialog).

## geometry

- **`RectilinearGeometry`**, `src/geometry/rectilinear.ts`, inferred
  Exact boolean operations and area for rectilinear integer-mm polygons, by coordinate compression. Contract: `union, difference, intersection, area, toRings, largestFreeRect`; all inputs must be axis-aligned; the project uses no polygon-clipping dependency.
  Consumers: ? (planned: WallDerivation, AreaOps, net area, label placement, totals).
- **`WallDerivation`**, `src/geometry/walls.ts`, inferred
  Derives wall segments, runs, rectangles and faces from areas, lot and wall settings. Contract: `deriveWallSegments, deriveBoundarySegments, wallRuns, wallRects, wallFaces`; the wall axis is the drawn edge; room-room is internal (150 mm default), room-other is external (200 mm default); the lot wall is 150 mm inside the lot line; a house wall on the lot line shifts fully inside the lot and suppresses the lot wall there.
  Consumers: ? (planned: scene derive, WallsLayer, openings, net area, dimensions, Snapper, ruler raycast, hit test).
- **`Snapper`**, `src/geometry/snap.ts`, inferred
  One snap engine with candidate priority and guide output. Contract: `snapCoord, snapRoomRect, snapItem, snapOpening, snapRulerEnd` over `SnapContext { step, enabled, tolMm, lot, alignX, alignY, faces, runs }`; room step 500 mm; tolerance is screen px times mm per px.
  Consumers: ? (planned: build tool, select handlers, item tool, opening tool, ruler tool).
- **`AreaOps`**, `src/geometry/areaOps.ts`, inferred
  Domain edits on areas that keep ids, open boundaries, openings and slivers consistent. Contract: pure `insertArea, moveEdge, translateArea, splitArea, mergeAreas, deleteArea, setOpenBoundary, clampToLot`, each returns `OpResult { patch, messages, valid }`; a new room carves overlapped rooms; the largest piece keeps the id; slivers under 200 mm or 0.25 m² drop with a message. `freeSpotFor(doc, shape, fallbackCenter) -> Shape | null` gives the first free place next to the shape (right, below, left, above, edge to edge), else centered on the fallback on the 500 mm grid; free means inside the lot and over no room or covered area; area paste and duplicate (`src/editor/select/area.ts`) put copies there without carving.
  Consumers: >=1 (area select copy, paste and duplicate); planned: build tool, split mode, area and wall select handlers, AreaInspector, WallInspector, LotInspector.
- **`FrontageGeometry`**, `src/geometry/frontage.ts`, confirmed
  The sidewalk layout and the placement rules of ramps, street trees and sliding gates. Contract: `sidewalkStrips(lot)` (access, free and service strips from the lot line), `streetSides(lot)`, `defaultFrontage(lot)`, `freeTreeSpot`, `freeRampSpot`, `clearTreesFromRamps(lot, openings) -> Lot` (the same object when nothing changes), `syncGateRamps(doc, prev, moveTrees) -> Partial<ProjectDoc>` (`{}` when nothing changes), `slidingGateSpots`, `parkingHinge`, `frontageHit(lot, p, tolMm)`. Each vehicle gate (`gate-sliding`, `gate-tilt`) on a street-side lot wall keeps one linked ramp that follows it and goes away with it; items on a side that stops being a street side go away; a tree in the way of a ramp or gate moves to the nearest free spot on its side, or goes away. `startFrontageSync()` (`src/editor/frontageSync.ts`, mounted by Canvas) runs `syncGateRamps` after every doc change and patches the doc in place, inside the history step of that change; during a gesture only ramps follow, and trees move when the gesture ends; edit code does not call the sync itself.
  Consumers: >=8 (frontageSync, ContextGeometry, codec, factories, frontage select handlers, FrontageOutline, FrontageInspector, LotInspector).
- **`SunModel`**, `src/geometry/sun.ts`, confirmed
  The sun position for the site and the shadows and window sun patches of a plan. Contract: `sunPosition(date, minutes)`, `sunTimes(date)`, `sunDirection(azimuth, northDeg)`, `deriveSunModel(doc, scene, lookup, ctx: SunContext) -> SunModel { prisms, roofPath, windows, rooms, bounds }` (cached per scene, doc and context), `sunFrame(model, date, minutes, northDeg) -> { position, day, shadowD, patches }`, `sunSummary(model, date, northDeg) -> RoomSun[]` sampled every 15 min, `sunAmbient(elevation)`. `SUN_SITE` (São Paulo) is the only site; caster heights come from `SUN_HEIGHTS`; every area that is not `outdoor` is roofed; glass is every window type plus `door-balcony`.
  Consumers: >=3 (SunLayer, SunBar, SunClock).

## editor

- **`History`**, `src/store/docStore.ts`, inferred
  Undo and redo with one entry per gesture and rollback on cancel. Contract: `load, close, commit(label, recipe), beginGesture, updateGesture (always from the gesture base), endGesture, cancelGesture, undo, redo`; limit 200; view preferences are not in the doc.
  Consumers: ? (planned: every tool, every inspector, shortcuts, autosave).
- **`Camera`**, `src/store/cameraStore.ts`, inferred
  World-to-screen math, zoom bounds, fit and live gesture transform with no React render per frame. Contract: `camera: CameraApi` with `get, subscribe, worldToScreen, screenToWorld, mmPerPx, zoomAt, panBy, fit(bounds, paddingPx, animate), setViewport, commitLive, isLive`; zoom 0.004 to 0.6 px per mm.
  Consumers: >=2 (ToolContext, area select copy placement); planned: Canvas, overlay, input router, tools, canvas controls, coach.
- **`Tool`**, `src/editor/tools/types.ts`, registry `src/editor/tools/registry.ts`, confirmed
  The contract between the input router and the editor tools. Contract: `{ id: ToolId, cursor?, onActivate?, onDeactivate?, onHover?, onDragStart? (false or omitted lets the router pan), onDrag?(p, start), onDragEnd?(p, start), onTap?, onLongPress?, onCancel? (second pointer, Escape or tool switch; roll back with ctx.doc.cancelGesture()), onKey? -> boolean }`; every hook gets `ToolContext { getDoc, getScene, getUi, doc, ui, camera, feedback, snapContext, tolMm }`.
  Consumers: ? (planned: input router, ToolBar, shortcuts, coach).
- **`SelectHandler`**, `src/editor/tools/types.ts`, registry `SELECT_HANDLERS` in `src/editor/tools/select.ts`, confirmed
  The contract between the select tool and the behavior of each hit kind. Contract: `{ kind, onTap?(hit, p, ctx), onDragStart?(hit, p, ctx) -> boolean, onDrag?, onDragEnd?, onCancel?, getHandles?(ctx) (screen-space handles of the current selection), onHandleDrag?(handleId, p, start, ctx, phase: 'start' | 'move' | 'end'), onHandleTap? }`; one handler per hit kind; labels belong to their area and lot walls to the lot.
  Consumers: >=1 (select tool); the implementers are the entries of `SELECT_HANDLERS`.
- **`SunClock`**, `src/store/sunStore.ts`, confirmed
  The date, time and play state of the sun study. Contract: `sunStore` and `useSun(selector)` over `{ on, date: SunDate, minutes, playing }` with `toggle, close, setDate, setMinutes, play, pause`; `SEASONS` holds the southern hemisphere solstices and equinoxes; minutes clamp to 05:00 to 19:30; `play` runs from sunrise to sunset. It is screen-only view state: never in the doc, the undo history or the saved file.
  Consumers: >=3 (SunLayer, SunBar, CanvasControls).

## render

- **`RenderContext`**, `src/render/RenderContext.ts`, inferred
  One renderer for screen, print and thumbnail modes. Contract: `{ mode: 'screen' | 'print' | 'thumb', theme, print: { scale, mono } | null, layers, reducedMotion }`; print mode uses explicit attributes and hex colors only, because svg2pdf.js ignores CSS variables, `oklch()`, `vector-effect` and `paint-order`.
  Consumers: ? (planned: every render layer, every Symbol and Pattern, PrintSheet, thumbnail renderer).
- **`ContextGeometry`**, `src/render/layers/ContextLayer.tsx`, confirmed
  The neighborhood drawn around the lot: streets, curbs, intersections, neighbor lots and houses, and street trees. Contract: `contextGeometry(lot) -> ContextGeom { bounds, streets, lots, lotLines, houses }`; each street group carries paints, joints, edges, ramps and `TreeMark` trees, with the model tree id or null for decorative neighbor trees; the result is cached per `Lot` object, so a lot change must replace the object, never mutate it. A corner lot gets a corner street that ends at the front curb line, rounded curbs at both corners and a set-back pedestrian crossing; decorative trees keep clear of the user's own frontage.
  Consumers: >=3 (ContextLayer, StreetCanopies in LotLayer, SunLayer casters).
- **`StreetTreeCrown`**, `src/render/streetTree.tsx`, confirmed
  The top-view look of a street tree species, shared by the frontage trees and the decorative neighbor trees. Contract: `StreetTreeCrown({ x, y, size, species, seed, ctx })` centered on (x, y); `CanopyShadow({ x, y, size, seed, ctx })` draws in screen mode only; `SPECIES_LOOK` holds the colors per `StreetTreeSpecies`; `seedOf(id)` gives the stable shape seed.
  Consumers: >=2 (StreetCanopies in ContextLayer, FrontageInspector through `SPECIES_LOOK`).

## export

- **`ExportSheet`**, `src/export/sheet.ts` (+ `layout.ts`, `types.ts`), confirmed
  The one print sheet that PDF, SVG and PNG export all render from. Contract: `renderSheet(doc, opts: ExportOptions) -> { svg, layout, dispose() }` (call `dispose()`), `layoutSheet(content, pad, paper, fixedScale) -> SheetLayout` (a null scale picks the smallest denominator of `SCALES` that fits), `exportPdf(doc, opts)`, `exportSvg(doc, opts)`, `exportPng(doc, opts, dpi)`; failures throw `ExportError` with a pt-BR `userMessage`. The sheet renders through [[PRIMITIVES#RenderContext]] in print mode; `mono` turns every hex paint gray; print text weights become 400 or 700, because svg2pdf maps only those to the Inter faces; PNG draws the self-contained SVG on a canvas; jsPDF and svg2pdf load only on the first PDF export.
  Consumers: >=1 (ExportDialog).
- **`downloadFile`** and **`downloadUrl`**, `src/export/share.ts`, confirmed
  Saves a file to the device through a temporary `<a download>` link. Contract: `downloadFile(file: File)` makes its own object URL and revokes it after a delay; `downloadUrl(url, name)` saves an object URL that the caller owns and revokes, and must run straight from a tap; `shareOrDownload(file, title) -> 'shared' | 'cancelled' | 'downloaded'` (same file) falls back to `downloadFile` when the browser cannot share files or the share fails. Known duplicate: `downloadProjectFile` in `src/io/projectFile.ts` has its own copy of the link code, with a shorter revoke delay, so a change to the download link goes into both until it calls `downloadFile`.
  Consumers: 4 (shareOrDownload and GalleryScreen call downloadFile; downloadFile and ExportDialog call downloadUrl, ExportDialog with the URL from [[PRIMITIVES#useObjectUrl]]); shareOrDownload has 2 (ExportDialog, ShareDialog).

## styles

- **`ThemeTokens`**, `src/styles/tokens.css`, confirmed
  The color tokens that every component stylesheet paints with, in light and dark. Contract: light values on `:root`; dark values in two identical blocks, `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` for the auto theme and `:root[data-theme="dark"]` for the forced one, so every dark change goes into both blocks; `src/App.tsx` sets `data-theme` on `<html>` from `uiStore.prefs.theme` and removes it for auto. `--success-soft` (fill) and `--success-line` (border) paint a success row. `--switch-off` (track fill) and `--switch-off-line` (inset ring) paint the OFF track of a switch, and both keep 3:1 contrast against every surface.
  Consumers: ? for the whole file; success row pair 1 (`.export-ready` in `ExportDialog.css`); switch pair 1 (`Switch.css`).

## ui

- **`ThemeToggle`**, `src/ui/ThemeToggle.tsx` (+ `ThemeToggle.css`), confirmed
  The shared sun and moon switch between the light and dark themes. Contract: `ThemeToggle({ variant?, className? })`, the `IconButton` props of the same name; it reads the theme on screen from [[PRIMITIVES#useEffectiveTheme]] and one tap stores the opposite through `setPrefs({ theme })`, which persists the prefs; it never stores `auto`; it shows the moon with "Usar tema escuro" in light and the sun with "Usar tema claro" in dark. SettingsDialog sets the same pref with a `Segmented` control (`THEME_OPTIONS`, only "Claro" and "Escuro") whose value comes from the same hook, so a new theme value goes into both. The pref reaches the CSS as [[PRIMITIVES#ThemeTokens]] says.
  Consumers: 2 (TopBar, StartScreen with `start-theme`).
- **`useEffectiveTheme`**, `src/ui/useEffectiveTheme.ts`, confirmed
  The theme on screen, for every control that shows or flips the theme. Contract: `useEffectiveTheme() -> EffectiveTheme` (`'light' | 'dark'`); it returns the stored `uiStore.prefs.theme`, or the live OS `prefers-color-scheme` theme while the pref is `auto`, and re-renders when the OS theme changes. `auto` is the "never chose" value: it is the default, and no control writes it, so a theme control reads this hook, never the raw pref.
  Consumers: 2 (ThemeToggle, SettingsDialog theme control).
- **`Logo`**, `src/ui/screens/Logo.tsx` (+ `Logo.css`), confirmed
  The in-app Minha Casinha mark, which follows the theme. Contract: `Logo({ size = 56 })`; it is decorative (`aria-hidden`), so the app name sits next to it as text; the gradient id comes from `useId`, so several logos on one page do not clash; the colors are `--logo-*` custom properties in `Logo.css` under the same three theme blocks as [[PRIMITIVES#ThemeTokens]], so a theme selector change goes into both files; `--logo-shadow-tint` is for a drop shadow that the consumer draws. Print sheets and PWA icons keep the navy brand and do not use it: `src/export/PrintSheet.tsx` draws its own `LogoMark`.
  Consumers: 2 (StartScreen, which draws the shadow, and AboutDialog).
- **`Thumb`** and **`relativeTime`**, `src/ui/screens/StartScreen.tsx`, confirmed
  The plan thumbnail and the pt-BR "edited when" label of a plan card. Contract: `Thumb({ svg, large? })` shows the SVG text only as an `<img>` data URL, never as markup, so a thumbnail from storage or from a received plan cannot run script; an empty string shows the house icon; it paints with `.plan-thumb` from `StartScreen.css`. `relativeTime(iso, now = Date.now())` formats with `Intl.RelativeTimeFormat('pt-BR')`, gives "agora mesmo" under one minute and an empty string for a bad date. Candidate for extraction: both live in `StartScreen.tsx`, so move them and the `.plan-thumb` styles to a shared module before a third consumer needs them.
  Consumers: 2 (StartScreen `PlanCard` and the latest-plan card, GalleryScreen `GalleryCard`).
- **`GalleryScreen`**, `src/ui/screens/GalleryScreen.tsx` (+ `GalleryScreen.css`), confirmed
  The private gallery where the owner sees, opens and downloads the received plans. Contract: default export, lazy-loaded by App for the `'gallery'` value of `Screen` (`src/store/uiStore.ts`), which only [[PRIMITIVES#startGalleryRoute]] sets; the back button and the browser back return to start; analytics `PAGES` maps it to `/galeria` ([[PRIMITIVES#track]]). With no stored key it shows a key form, and it stores a key ([[PRIMITIVES#getGalleryKey]]) only after the key passes a `listPlans` call; a later 401 clears the key and shows the form again, and "Sair da galeria" clears it too. Plans group by device (first 6 characters of the id), newest first; each card fetches its plan when it comes near the viewport, renders the thumbnail locally with `renderThumbSvg`, and caches each version for the life of the tab. "Abrir cópia" opens the plan through `importProjectText` as a new local copy with the ` (galeria)` suffix, and "Baixar JSON" saves it through [[PRIMITIVES#downloadFile]]; the received plan never changes. It adds `robots: noindex, nofollow` while mounted. It uses the StartScreen class names from `StartScreen.css` (`plan-grid`, `plan-card`, `start-empty*`, `start-h2`, `start-label`, `start-input`) and [[PRIMITIVES#Thumb]], so a rename there breaks the gallery.
  Consumers: 1 (App).
- **`useObjectUrl`**, `src/ui/dialogs/ExportDialog.tsx` (local, not exported), confirmed
  Keeps one object URL per file for the life of the component. Contract: `useObjectUrl(file: File | null) -> string | null`; null while there is no file; the URL is revoked when the file changes and on unmount. Candidate for extraction: it is local to ExportDialog, so move it to a shared hook before a second component needs a ready object URL. It revokes at once on change, so the export preview (`usePreview`, same file) keeps its own lifecycle that revokes after the image swap.
  Consumers: 1 (ExportDialog, for the download button through [[PRIMITIVES#downloadFile]]).

## analytics

- **`track`**, `src/analytics/track.ts` (+ `index.ts`), confirmed
  The only way to send an analytics event. Contract: `track(name, params?)` sends `gtag('event', name, params)` and never throws; names and params are typed in `AnalyticsEvents`. The Google tag in the GTM container (`G-D5GSQGSWEZ`, set in the container, not in the code) forwards every event to GA4 with no GTM tag or variable per event, so a new event or param needs no GTM change. gtag event params do not persist between events, so there is no key list and no undefined padding. `setPage(screen)` sends `gtag('set', { page_location, page_title })` with the origin plus the virtual path of the screen from `PAGES` in `track.ts`, never the real URL, because the `#plan=` hash holds the whole plan; `PAGES` is a `Record<Screen, …>`, so a new `Screen` value does not typecheck until it has a path. `errorCode(message)` hashes a message into a short code, so no user text reaches analytics; `gtag()` is exported for the module's own commands. `startAnalytics()` (`index.ts`, called from `main.tsx`) runs only in production: it calls `setPage` before `gtag('js', new Date())`, so the automatic first `page_view` of the container uses the virtual page; on each later `uiStore.screen` change it calls `setPage` and then `track('page_view')`; it injects gtm.js when the browser is idle. Call sites import from `track.ts`, never `index.ts`, so stores do not import uiStore through it.
  Consumers: 16 import `track.ts` (Toast, ExportDialog, ShareDialog, SettingsDialog, StartScreen, LotWizard, ThemeToggle, shortcuts `commands.activateTool`, docStore undo and redo, sunStore toggle, build, item and opening tools, repository `openProject`, projectFile, shareLink); `index.ts` has 1 (main.tsx).

## persistence

- **`onDocSaved`** and **`onUserEdit`**, `src/persistence/autosave.ts`, confirmed
  The hooks that let a module follow stored writes and user edits with no change to the autosave or the doc store. Contract: `onDocSaved(fn: (doc, updatedAt) => void) -> unsubscribe` runs after each successful `persistDoc` write (autosave and its flush, the first save of a new plan, copy or import in `openFresh`, and a rename of a stored plan from the start screen), with a new doc object that carries the stored `updatedAt`, so compare docs by id, not by identity. `onUserEdit(fn: (id) => void) -> unsubscribe` runs at the same place as `noteEdit()`: a change to the open, writable doc outside a gesture, or a gesture end that changed it; it never runs on load, on a cancelled gesture or on a change back to the stored doc. Listeners run synchronously, and the hooks catch a throw from a listener, so a listener never stops a save or an edit.
  Consumers: 1 (startCollect, for both).

## collect

- **`postPlan`**, **`listPlans`** and **`fetchPlanText`**, `src/collect/api.ts` (+ `config.ts`), confirmed
  The only client of [[PRIMITIVES#minha-casinha-plantas]]; `PLANS_API` in `config.ts` is the one place that holds its origin. Contract: `postPlan(meta: UploadMeta, body, keepalive) -> status` rejects only on a network failure, and sends `text/plain;charset=UTF-8` so the POST stays a simple CORS request with no preflight; `uploadUrl(meta)` builds its query. `listPlans(key) -> RemotePlan[]` is newest first, drops entries whose ids fail `ID_PATTERN` and gives 0 for an unknown lot size; `fetchPlanText(key, device, project) -> string` is the project JSON text, untrusted until it goes through the codec. The GET calls send `Authorization: Bearer <key>` with `cache: 'no-store'` and throw `GalleryApiError` with `kind` `unauthorized` (401), `not-found` (404), `server` (other failed status or a bad list body) or `network` (no response). `ID_PATTERN` is the device and project id rule; the Worker keeps an identical copy, so a change goes into both.
  Consumers: postPlan 1 (startCollect); listPlans, fetchPlanText and GalleryApiError 1 (GalleryScreen); ID_PATTERN 2 (api.ts, startCollect).
- **`getGalleryKey`**, `src/collect/galleryKey.ts`, confirmed
  The stored gallery key, which also marks the owner's device. Contract: `getGalleryKey() -> string | null`, `setGalleryKey(key)`, `clearGalleryKey()`, `hasGalleryKey()` over localStorage `casinha:gallery-key`; blocked storage reads as no key, and a key that cannot be stored lasts only while GalleryScreen holds it. A device with a key never uploads, because [[PRIMITIVES#startCollect]] checks `hasGalleryKey()` before each step; "Sair da galeria" clears the key, so that browser uploads again.
  Consumers: 2 (GalleryScreen through get, set and clear; startCollect through `hasGalleryKey`).
- **`startCollect`**, `src/collect/uploader.ts`, confirmed
  Sends a copy of each plan that the user edited to [[PRIMITIVES#minha-casinha-plantas]], in production only and never on the owner's device ([[PRIMITIVES#getGalleryKey]]). Contract: `startCollect() -> stop`, mounted once by App; it listens to `onDocSaved` and `onUserEdit` ([[PRIMITIVES#onDocSaved]]) and keeps its state in localStorage `casinha:collect` (a random device id, the `since` time, per-plan `edited`, `dirty` and last `sent` hash, and one backoff for all plans), which it reads again at each step because other tabs share it. A plan uploads only when it has a room and counts as edited: `onUserEdit` saw an edit to it, or the plan was created before `since` and its drawing is unlike every template, so an untouched template copy never uploads. The body is the gzip of `serializeProject`; the content hash ignores `updatedAt`, and a plan whose hash equals the last sent one does not upload. Throttle: one upload at once, then at most one per plan per `THROTTLE_MS`, and the last one in the window sends the latest version. Flush on hide (`visibilitychange` to hidden, `pagehide`): it sends the dirty plans at once with `keepalive`, from a body prepared after the save, past the throttle but at most once per plan per `HIDE_GAP_MS`, inside the shared 64 KB keepalive budget; a save while the page is hidden flushes at once. A 429 starts the shared backoff, which doubles up to `BACKOFF_MAX_MS`; a body over 1 MB, the Worker limit, never uploads; other failures keep the plan dirty for a later save or session. Backfill, `BACKFILL_DELAY_MS` after start: it removes the state of deleted plans and sends the dirty and never-sent plans one at a time, at most `BACKFILL_MAX` per session.
  Consumers: 1 (App).
- **`startGalleryRoute`**, `src/collect/galleryRoute.ts`, confirmed
  The only way into the private gallery: the `#galeria` hash; the app has no link to it. Contract: `startGalleryRoute()`, mounted once by App, checks the hash on load and on each `hashchange`; on `#galeria` it removes the hash from the address with `replaceState`, closes an open plan through `closeProject()` and sets the `'gallery'` screen. The hash never stays in the address, so the screen lives only in `uiStore`, and a later `#galeria` visit is a new hash change.
  Consumers: 1 (App).
- **`minha-casinha-plantas`**, `workers/plans/worker.js` (+ `wrangler.toml`), confirmed
  The Cloudflare Worker that stores the collected plans in R2 and serves them to the gallery. Contract: R2 binding `PLANS` on bucket `minha-casinha-prd`, one object per plan at `plans/<device>/<project>.json`, which each upload overwrites, so only the latest version stays; it is served on its `workers.dev` origin, which `PLANS_API` holds ([[PRIMITIVES#postPlan]]); `wrangler.toml` is the reference config, and the deploy goes through the Cloudflare API with the same settings. `POST /v1/plans?device&project&name&w&d&updated` takes a gzip body (found by its magic bytes, not by a header) or plain JSON and answers 204; 400 for a bad id, gzip or JSON, or a body without `format: 'casinha.project'` and a numeric `schemaVersion`; 413 over 1 MB raw or 8 MB inflated; 429 past `WRITE_LIMIT`, 30 writes per 60 s per `CF-Connecting-IP`, which applies only while that binding exists; the query becomes cleaned R2 custom metadata. `GET /v1/plans` gives `{ plans: [{ device, project, name, lotWidthM, lotDepthM, updatedAt, bytes }] }`, newest first, from the full R2 list, with null for an unknown lot size. `GET /v1/plans/<device>/<project>` gives the stored JSON text, or 404. Both GET routes need `Authorization: Bearer <GALLERY_KEY>`, compared as SHA-256 digests with `timingSafeEqual`, and answer 401 while the secret is not set; `GALLERY_KEY` is a Worker secret, never in the repo. CORS headers go only to an `Origin` in `ALLOWED_ORIGINS` (the production app and the local Vite dev server); OPTIONS answers 204; every response carries `Cache-Control: no-store` and `Vary: Origin`.
  Consumers: 2 clients (startCollect through `postPlan`; GalleryScreen through `listPlans` and `fetchPlanText`).
