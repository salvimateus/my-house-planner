# Primitives

Location: project root, single package.
Status is `confirmed` or `inferred`; `pending` marks code not yet on the integration branch, with the branch name when one exists.

## model

- **`Lot`**, `src/model/types.ts`, inferred
  The single reference frame of the plan, with street sides and boundary walls. Contract: `{ width, depth, frontSide, cornerSide, boundaryWalls, sidewalkWidth, northDeg, ground }`, integer mm, origin at the lot top-left, x right, y down.
  Consumers: ? (planned: ContextLayer, LotLayer, WallDerivation, Snapper, export layout, LotWizard, LotInspector).
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
  A parametric top-view symbol per item type, with defaults, variants, limits and wall-snap behavior. Contract: `defineItem({ type, label, category, keywords, size, min, max, variants?, wallSnap, layer, color, colorable, keepAspect?, Symbol })`; `Symbol({ w, d, color, ctx })` draws centered at (0,0) with the back side at `-d/2`; unknown types use `generic-box`; the registry is the canonical list, built with `import.meta.glob`.
  Consumers: ? (planned: ItemsLayer, CatalogPanel, ItemInspector, Snapper).
- **`OpeningDef`**, `src/catalog/openings/*.tsx`, inferred, pending
  An opening symbol drawn in the wall gap, with host compatibility and size presets. Contract: `defineOpening({ type, label, group, hosts, widths, defaultWidth, height, sill, minWidth, maxWidth, hasSwing, tip, Symbol })`; windows host only on external walls, gates only on the lot wall.
  Consumers: ? (planned: OpeningsLayer, OpeningsPanel, opening tool, OpeningInspector).
- **`MaterialDef`**, `src/catalog/materials/*.tsx`, inferred
  A floor fill as a true-scale SVG pattern, valid on screen and in SVG, PDF and PNG export. Contract: `defineMaterial({ id, label, group, permeable, defaultColor, tile, Pattern, flatColor })`; `Pattern` returns a `<pattern patternUnits="userSpaceOnUse">` in mm with hex colors only; `solid` is the default when an id is unknown.
  Consumers: ? (planned: PatternDefs, AreasLayer, FillPicker, PaintPanel, totals (permeable area)).
- **`RoomPreset`**, `src/catalog/roomPresets.ts`, inferred
  Room types with default name, kind, fill and soft rules. Contract: `ROOM_PRESETS: Record<RoomPresetId, { label, kind, fill, icon, minArea?, needsWindow?, doorWidth? }>`, `presetFor(id)`.
  Consumers: ? (planned: build tool type picker, AreaInspector, factories, opening tool, plan checks, templates).

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
  Domain edits on areas that keep ids, open boundaries, openings and slivers consistent. Contract: pure `insertArea, moveEdge, translateArea, splitArea, mergeAreas, deleteArea, setOpenBoundary, clampToLot`, each returns `{ patch, messages, valid }`; a new room carves overlapped rooms; the largest piece keeps the id; slivers under 200 mm or 0.25 m² drop with a message.
  Consumers: ? (planned: build tool, split mode, area and wall select handlers, AreaInspector, WallInspector, LotInspector).

## editor

- **`History`**, `src/store/docStore.ts`, inferred
  Undo and redo with one entry per gesture and rollback on cancel. Contract: `load, close, commit(label, recipe), beginGesture, updateGesture (always from the gesture base), endGesture, cancelGesture, undo, redo`; limit 200; view preferences are not in the doc.
  Consumers: ? (planned: every tool, every inspector, shortcuts, autosave).
- **`Camera`**, `src/store/cameraStore.ts`, confirmed
  World-to-screen math, zoom bounds, fit and live gesture transform with no React render per frame. Contract: `camera: CameraApi` with `get, subscribe, worldToScreen, screenToWorld, mmPerPx, zoomAt, panBy, fit(bounds, paddingPx, animate), setViewport, commitLive, isLive`; `CameraState.committed` is what the viewBox shows and changes only on `commitLive` or a non-animated `fit`, so every camera gesture must end with `commitLive`; zoom bounds come from `tuning.camera.minZoom` and `maxZoom`.
  Consumers: 11 (Canvas, InputRouter, toolContext, OverlaySvg, Handles, Guides, Readout, StatusBar, shortcuts, devApi, tools/types).
- **`Tool`**, `src/editor/tools/types.ts`, confirmed
  The contract between the input router and the editor tools. Contract: `{ id, cursor?, onActivate?, onDeactivate?, onHover?, onDragStart? (false lets the router pan), onDrag?, onDragEnd?, onTap?, onLongPress?, onCancel? (second finger, Escape, tool switch), onKey? }`; lookup by id is [[PRIMITIVES#TOOLS]]; Canvas wires `onKey`, not [[PRIMITIVES#attachInput]].
  Consumers: >=8 (InputRouter, registry, build, item, opening, paint, ruler and select tools).
- **`TOOLS`**, `src/editor/tools/registry.ts`, confirmed, pending
  The tool lookup by id for everything that dispatches to the active tool. Contract: `TOOLS: Record<ToolId, Tool>`, `toolFor(id)`; a new [[PRIMITIVES#Tool]] is reachable only after it is added here.
  Consumers: 2 (Canvas, devApi).
- **`toolContext`**, `src/editor/toolContext.ts`, confirmed, pending
  The single `ToolContext` of the app; every getter reads the stores live, so tools never hold a state snapshot. Contract: interface `ToolContext { getDoc, getScene, getUi, doc, ui, camera, feedback, snapContext(), tolMm(px?) }` in `src/editor/tools/types.ts`; `doc` is `readOnly` plus the [[PRIMITIVES#History]] actions; `feedback` is [[PRIMITIVES#feedback]]; `tolMm` defaults to `tolPxFor(pointerKind())`, the mouse or touch tolerance from `tuning.touch`; `setPointerKind` is called by [[PRIMITIVES#attachInput]] on each press; `setCursorSink` is registered by Canvas; `setCanvasCursor(cursor | null)` sets the hover cursor, and null restores the tool cursor.
  Consumers: 5 (Canvas, InputRouter, select tool, overlay Handles, devApi).
- **`attachInput`**, `src/editor/InputRouter.ts`, confirmed, pending
  The only pointer arbitration on the canvas, so tools receive taps and drags, never raw pointer events. Contract: `attachInput(svg, { tool(), ctx(), spaceHeld(), onPan?(active) }) -> cleanup`; a drag starts past `tuning.touch.dragSlopMousePx` or `dragSlopTouchPx`; long press is touch and pen only and ends the gesture; `onDragStart` false or absent, the middle button or Space pans; a second pointer, Escape or a tool switch in a gesture calls `onCancel`, then `ctx.doc.cancelGesture()`, then clears the transient, and a second pointer then pinches; moves reach tools at most once per animation frame, and the last move lands before `onDragEnd`; Ctrl+wheel and plain wheel zoom, Shift+wheel and horizontal wheel pan; `onHover` gets mouse and pen moves only while no pointer is down.
  Consumers: 1 (Canvas).
- **`selectTool`**, `src/editor/tools/select.ts`, confirmed, pending
  The select router that sends each gesture to the `SelectHandler` of what is under the pointer. Contract: `SelectHandler { kind, onTap?, onDragStart?, onDrag?, onDragEnd?, onCancel?, getHandles?, onHandleDrag?(id, p, start, ctx, phase), onHandleTap? }` in `src/editor/tools/types.ts`; order is the handles of the current selection, then `hitTest`, then `SELECT_HANDLERS[hit.kind]`, where `label` goes to the area handler and `boundary` to the lot handler; `handlerForSelection(sel)` gives the owner of the selection handles; `marqueeStore` holds the screen-space Shift+mouse marquee for the overlay; a drag on empty space, the lot or an unselected area pans; a handler without `onTap` gets the default selection; long press toggles multi selection for items, openings and rulers.
  Consumers: 3 (registry, overlay Handles, OverlaySvg).
- **`LotActions`**, `src/editor/select/lot.ts`, confirmed, pending
  The lot edits and lot side names shared by the lot inspector, the wizard and the lot select handler. Contract: `resizeLot(front, depth) -> messages` maps front and depth through `frontSide` and clips the plan with [[PRIMITIVES#AreaOps]] `clampToLot` in one commit; `rotateFront()` moves the front and corner one side clockwise and the house keeps lot coordinates; `setCornerSide(side | null), setBoundaryWall(side, on), setNorth(deg), setGround(fill)`; `frontAndDepth(lot)`, `sideRole(lot, side)` (the left of a viewer in the street is the next side clockwise from the front), `cornerChoices, CW_SIDE, OPPOSITE_SIDE, LOT_LIMITS, normalizeDeg`; `lotHandler` selects the lot on a lot wall tap, toggles the selection on an empty lot tap, and always pans on drag.
  Consumers: 3 (LotInspector, LotWizard (`setCornerSide`), select tool (`lotHandler`)).

## render

- **`RenderContext`**, `src/render/RenderContext.ts`, confirmed
  One renderer for screen, print and thumbnail modes. Contract: `{ mode: 'screen' | 'print' | 'thumb', theme, print: { scale, mono } | null, layers, reducedMotion }`, read with `useRenderContext()`; `strokeProps(ctx, screenPx, paperMm)` gives every stroke width per mode and `printSize(ctx, paperMm)` scales a paper size to world mm; print mode uses explicit attributes and hex colors only, because svg2pdf.js ignores CSS variables, `oklch()`, `vector-effect` and `paint-order`.
  Consumers: >=20 (every scene layer, PatternDefs, SceneSvg, thumb, theme, Canvas, overlay Ghost and OverlaySvg, catalog types, registry and symbolKit, material kit, dev galleries).
- **`SceneTheme`**, `src/render/theme.ts` (type in `src/render/RenderContext.ts`), confirmed, pending
  The hex color sets of the scene for screen and mono print. Contract: `SCENE_THEME`, `MONO_THEME`, `themeFor(mono)`, keyed by `SceneColor`, hex only ([[PRIMITIVES#RenderContext]]); `treeColors(ctx)` is outside `SceneTheme`, so a scene color outside the theme must branch on `ctx.print?.mono` the same way.
  Consumers: 3 (Canvas, thumb, ContextLayer (`treeColors`)).
- **`SceneLayers`**, `src/render/SceneSvg.tsx`, confirmed, pending
  The one layer stack in paint order for the editor canvas, the print sheet and thumbnails. Contract: `SceneLayers({ data: SceneData { doc, scene, pxPerMm?, live }, ctx })` renders into a caller-owned `<svg>`, with `PatternDefs` for `fillsInUse(doc)` (area fills and lot ground) and the providers of [[PRIMITIVES#RenderContext]] and `useSceneData()`; `SceneSvg({ doc, scene, ctx, viewBox, width, height, background? })` is the standalone root for print, SVG export and thumbnails; the layers without props (Openings, Items, Rulers) read doc and scene through `useSceneData()`; `pxPerMm` is the committed zoom and is absent in print and thumb; `live` is true while a gesture changes the areas.
  Consumers: 2 (Canvas (`SceneLayers`, `fillsInUse`), `renderThumbSvg` in `src/render/thumb.ts` (`SceneSvg`)).
- **`renderOffscreen`**, `src/render/renderOffscreen.ts`, confirmed, pending
  Synchronous React render into a hidden container on `document.body`, so layout, `getBBox` and computed styles work for export and thumbnails. Contract: `renderOffscreen(node) -> { root, dispose() }`, where `root` is the first rendered element; it throws and cleans up when the tree renders no element; the caller must call `dispose()`.
  Consumers: 1 (`renderThumbSvg(doc) -> string` in `src/render/thumb.ts`, the 240 × 160 thumbnail with grid, textures and measures off).

## juice

- **`feedback`**, `src/juice/feedback.ts` (contract `Feedback` in `src/editor/tools/types.ts`), confirmed, pending
  The one feedback channel of the tools, which combines [[PRIMITIVES#playSound]], [[PRIMITIVES#vibrate]] and [[PRIMITIVES#ScreenEffects]]. Contract: `tick(), place(), thunk(), remove(at: Vec)` (whoosh plus a burst at a world point), `invalid(target?)` (error plus a shake; with no target it shakes `.canvas`), `success()`; each channel checks its own preference; the import calls `installSoundUnlock()`.
  Consumers: 3 (toolContext, select/opening.ts, shortcuts).
- **`playSound`**, `src/juice/sound.ts`, confirmed, pending
  Short synthesized UI sounds with no audio files. Contract: `playSound(name: SoundName)` for `tick | pop | thunk | whoosh | error | success`, `installSoundUnlock()`; zzfx loads lazily on the first `pointerdown` or `keydown` while `prefs.sound` is on, so every sound before that gesture is silent; a repeat of the same sound inside its per-sound gap is dropped, and nothing plays while the document is hidden.
  Consumers: 1 (feedback).
- **`vibrate`**, `src/juice/haptics.ts`, confirmed, pending
  A short phone vibration behind the haptics preference. Contract: `vibrate(pattern: number | number[])`; it does nothing while `prefs.haptics` is off, before the first user activation or without `navigator.vibrate`; one shared gap, `tuning.haptics.minGapMs`, applies to all patterns, so a second call inside it is dropped.
  Consumers: 1 (feedback).
- **`ScreenEffects`**, `src/juice/effects.ts` (host `src/editor/overlay/Effects.tsx`), confirmed, pending
  Transient canvas effects as Web Animations, outside the React render. Contract: `burst(world: Vec)` (screen px, dropped off screen), `shake(el)`, `pop(el)`, `pulseRect(worldRect)` (a ring in world mm), `setEffectsHost({ world, screen } | null)`; `burst` and `pulseRect` do nothing until the `Effects` overlay registers the host, and `tuning.effects.maxNodes` caps the live nodes; all of them read `reducedMotion()` from `src/juice/tween.ts`: `burst`, `shake` and `pop` skip, `pulseRect` shows still for the same time.
  Consumers: 3 (feedback (`burst`, `shake`), HealthPanel (`pulseRect`), Effects overlay (`setEffectsHost`)); `pop` has none.

## education

- **`EducationProgress`**, `src/education/storage.ts`, confirmed, pending
  The once-only memory of hints, demos and lessons. Contract: `seen(key), markSeen(key), readCount(key), writeCount(key, n), resetEducation()`; localStorage keys take the `casinha:edu:` prefix; an in-memory mirror keeps each hint to once per session when storage is blocked; `resetEducation` runs on the `tutorial-requested` event in EducationLayer.
  Consumers: 5 (EducationLayer, tips, DemoPlayer, Coach, NetAreaLesson).
- **`DemoPlan`**, `src/education/demos.ts`, confirmed, pending
  A ghost-hand demo of one tool, fitted to the current plan and view. Contract: `planDemo(tool: DemoTool) -> DemoPlan { caption, hand: HandKey[], decorate(layer, timing) -> Animation[] } | null`, `DEMO_TOOLS`; all points are page px; it is null when the plan or the visible canvas (the part above an open bottom sheet) has no target; `DemoPlayer.tsx` plays it on `tool-activated` while the demo of that tool is not seen.
  Consumers: 1 (DemoPlayer).
- **`WallThicknessHost`**, `src/education/explainers/WallThickness.tsx`, confirmed, pending
  The wall thickness explainer dialog, which tells why the net area is smaller than the drawn area. Contract: `openWallThickness()` opens it from anywhere; it reads `doc.structure` for the internal and external values; mount exactly one `WallThicknessHost`; EducationLayer mounts it only on the editor screen, so on other screens the dialog shows only when the editor mounts.
  Consumers: 3 (EducationLayer (host), HealthPanel, NetAreaLesson).
- **`TIPS`**, `src/education/tips.ts`, confirmed, pending
  Soft rules of thumb for the plan, as text that guides and does not judge. Contract: `TIPS: Record<TipId, Tip { id, title, text, explainer?: 'wall-thickness' }>`, `contextTips(doc) -> Tip[]` (most specific first), `startContextTips() -> cleanup`, which shows a tip once as a toast on `opening-placed` (a door on a bathroom wall) and `ruler-created`, with the seen key `tip:<id>` in [[PRIMITIVES#EducationProgress]].
  Consumers: 2 (EducationLayer (`startContextTips`), HealthPanel (`contextTips`)).
- **`lessonActiveMs`**, `src/education/NetAreaLesson.tsx`, confirmed, pending
  The time left on the net area lesson, so other education marks do not cover it. Contract: `lessonActiveMs() -> ms`, 0 when no lesson shows; Coach waits this plus `tuning.coach.nextDelayMs` before its next mark.
  Consumers: 1 (Coach).
