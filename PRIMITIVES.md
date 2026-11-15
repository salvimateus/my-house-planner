# Primitives

Location: project root, single package.
Status is `confirmed` or `inferred`; `pending` marks code not yet on the integration branch, with the branch name when one exists.

## model

- **`Lot`**, `src/model/types.ts`, inferred, pending
  The single reference frame of the plan, with street sides and boundary walls. Contract: `{ width, depth, frontSide, cornerSide, boundaryWalls, sidewalkWidth, northDeg, ground }`, integer mm, origin at the lot top-left, x right, y down.
  Consumers: ? (planned: ContextLayer, LotLayer, WallDerivation, Snapper, export layout, LotWizard, LotInspector).
- **`Area`**, `src/model/types.ts`, inferred, pending
  The unit that users draw, name, paint and measure; walls derive from it. Contract: `{ id, kind: 'room' | 'covered' | 'outdoor', preset, name, shape, fill, labelOffset }`; shape is rectilinear integer-mm rings, outer ring with positive signed area; `covered` builds no wall to the outside; `outdoor` never builds walls and is never carved.
  Consumers: ? (planned: WallDerivation, AreaOps, render layers, AreaInspector, paint tool, export).
- **`Opening`**, `src/model/types.ts`, inferred, pending
  A door, window or gate that cuts a host wall, with hinge and swing. Contract: `{ id, type, axis, line, at, width, height, sill, hinge, side }`; the host wall run resolves at derive time; an opening without a host renders red with a warning and is never deleted silently.
  Consumers: ? (planned: WallsLayer, OpeningsLayer, opening tool, OpeningInspector, AreaOps, export).
- **`Item`**, `src/model/types.ts`, inferred, pending
  A free catalog object (furniture, fixture, car, tree, pillar) on its own layer. Contract: `{ id, type, variant, x, y, w, d, rotation, color, label, mirrored }`; enters boolean ops only as its axis-aligned box ([[PRIMITIVES#RectilinearGeometry]]).
  Consumers: ? (planned: ItemsLayer, item tool, Snapper, net area (pillars), label placement, ItemInspector, export).
- **`Ruler`**, `src/model/types.ts`, inferred, pending
  A user-placed fixed measurement. Contract: `{ id, mode: 'free', a, b } | { id, mode: 'fit', origin, axis }`; `fit` re-resolves wall face to wall face on every derive, with house walls and the lot wall as obstacles.
  Consumers: ? (planned: RulersLayer, ruler tool, RulerInspector, plan checks, export).
- **`Units`**, `src/model/units.ts`, inferred, pending
  The integer millimetre policy plus pt-BR format and parse for every label and input. Contract: `toMm, formatLength, formatArea, formatCm, formatOpening, parseMeters, roundMm`; area rounds half up on integer mm²; parse accepts comma and dot.
  Consumers: ? (planned: all labels, MeasureInput, LotWizard, inspectors, export title block).
- **`ProjectCodec`**, `src/model/codec.ts` (+ `migrate.ts`, `schema.ts`), inferred, pending
  The versioned persistence contract for storage, files and share links. Contract: `serializeProject(doc)`, `parseProject(text, { newId }) -> { doc, repairs }` or `CodecError` with a pt-BR `userMessage`; `format: 'casinha.project'`, integer `schemaVersion` with sequential migrations; a newer version is rejected; import always creates a copy.
  Consumers: ? (planned: repository, projectFile, shareLink, templates).

## catalog

- **`ItemDef`**, `src/catalog/types.ts`, registry `src/catalog/registry.ts`, inferred, pending
  A parametric top-view symbol per item type, with defaults, variants, limits and wall-snap behavior. Contract: `defineItem({ type, label, category, keywords, size, min, max, variants?, wallSnap, layer, color, colorable, keepAspect?, Symbol })`; `Symbol({ w, d, color, ctx })` draws centered at (0,0) with the back side at `-d/2`; unknown types use `generic-box`; the registry is the canonical list, built with `import.meta.glob`.
  Consumers: ? (planned: ItemsLayer, CatalogPanel, ItemInspector, Snapper).
- **`OpeningDef`**, `src/catalog/openings/*.tsx`, inferred, pending
  An opening symbol drawn in the wall gap, with host compatibility and size presets. Contract: `defineOpening({ type, label, group, hosts, widths, defaultWidth, height, sill, minWidth, maxWidth, hasSwing, tip, Symbol })`; windows host only on external walls, gates only on the lot wall.
  Consumers: ? (planned: OpeningsLayer, OpeningsPanel, opening tool, OpeningInspector).
- **`MaterialDef`**, `src/catalog/materials/*.tsx`, inferred, pending
  A floor fill as a true-scale SVG pattern, valid on screen and in SVG, PDF and PNG export. Contract: `defineMaterial({ id, label, group, permeable, defaultColor, tile, Pattern, flatColor })`; `Pattern` returns a `<pattern patternUnits="userSpaceOnUse">` in mm with hex colors only; `solid` is the default when an id is unknown.
  Consumers: ? (planned: PatternDefs, AreasLayer, FillPicker, PaintPanel, totals (permeable area)).
- **`RoomPreset`**, `src/catalog/roomPresets.ts`, inferred, pending
  Room types with default name, kind, fill and soft rules. Contract: `ROOM_PRESETS: Record<RoomPresetId, { label, kind, fill, icon, minArea?, needsWindow?, doorWidth? }>`, `presetFor(id)`.
  Consumers: ? (planned: build tool type picker, AreaInspector, factories, opening tool, plan checks, templates).

## geometry

- **`RectilinearGeometry`**, `src/geometry/rectilinear.ts`, inferred, pending
  Exact boolean operations and area for rectilinear integer-mm polygons, by coordinate compression. Contract: `union, difference, intersection, area, toRings, largestFreeRect`; all inputs must be axis-aligned; the project uses no polygon-clipping dependency.
  Consumers: ? (planned: WallDerivation, AreaOps, net area, label placement, totals).
- **`WallDerivation`**, `src/geometry/walls.ts`, inferred, pending
  Derives wall segments, runs, rectangles and faces from areas, lot and wall settings. Contract: `deriveWallSegments, deriveBoundarySegments, wallRuns, wallRects, wallFaces`; the wall axis is the drawn edge; room-room is internal (150 mm default), room-other is external (200 mm default); the lot wall is 150 mm inside the lot line; a house wall on the lot line shifts fully inside the lot and suppresses the lot wall there.
  Consumers: ? (planned: scene derive, WallsLayer, openings, net area, dimensions, Snapper, ruler raycast, hit test).
- **`Snapper`**, `src/geometry/snap.ts`, inferred, pending
  One snap engine with candidate priority and guide output. Contract: `snapCoord, snapRoomRect, snapItem, snapOpening, snapRulerEnd` over `SnapContext { step, enabled, tolMm, lot, alignX, alignY, faces, runs }`; room step 500 mm; tolerance is screen px times mm per px.
  Consumers: ? (planned: build tool, select handlers, item tool, opening tool, ruler tool).
- **`AreaOps`**, `src/geometry/areaOps.ts`, inferred, pending
  Domain edits on areas that keep ids, open boundaries, openings and slivers consistent. Contract: pure `insertArea, moveEdge, translateArea, splitArea, mergeAreas, deleteArea, setOpenBoundary, clampToLot`, each returns `{ patch, messages, valid }`; a new room carves overlapped rooms; the largest piece keeps the id; slivers under 200 mm or 0.25 m² drop with a message.
  Consumers: ? (planned: build tool, split mode, area and wall select handlers, AreaInspector, WallInspector, LotInspector).

## editor

- **`History`**, `src/store/docStore.ts`, inferred, pending
  Undo and redo with one entry per gesture and rollback on cancel. Contract: `load, close, commit(label, recipe), beginGesture, updateGesture (always from the gesture base), endGesture, cancelGesture, undo, redo`; limit 200; view preferences are not in the doc.
  Consumers: ? (planned: every tool, every inspector, shortcuts, autosave).
- **`Camera`**, `src/store/cameraStore.ts` (+ `src/editor/camera.ts`), inferred, pending
  World-to-screen math, zoom bounds, fit and live gesture transform with no React render per frame. Contract: `worldToScreen, screenToWorld, mmPerPx, zoomAt, panBy, fit, setViewport, commitLive, subscribe`; zoom 0.004 to 0.6 px per mm.
  Consumers: ? (planned: Canvas, overlay, input router, tools, canvas controls, coach).
- **`Tool`**, `src/editor/tools/types.ts`, registry `src/editor/tools/registry.ts`, inferred, pending
  The contract between the input router and the editor tools. Contract: `{ id, cursor?, onActivate?, onDeactivate?, onHover?, onDragStart? (false lets the router pan), onDrag?, onDragEnd?, onTap?, onLongPress?, onCancel? (second finger, Escape, tool switch), onKey? }`.
  Consumers: ? (planned: input router, ToolBar, shortcuts, coach).

## render

- **`RenderContext`**, `src/render/RenderContext.ts`, inferred, pending
  One renderer for screen, print and thumbnail modes. Contract: `{ mode: 'screen' | 'print' | 'thumb', theme, print: { scale, mono } | null, layers, reducedMotion }`; print mode uses explicit attributes and hex colors only, because svg2pdf.js ignores CSS variables, `oklch()`, `vector-effect` and `paint-order`.
  Consumers: ? (planned: every render layer, every Symbol and Pattern, PrintSheet, thumbnail renderer).
