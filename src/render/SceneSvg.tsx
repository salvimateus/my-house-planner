import type { ReactElement } from 'react';
import { createContext, useContext, useMemo } from 'react';
import type { Rect, Scene } from '../geometry/types.ts';
import type { Fill, ProjectDoc } from '../model/types.ts';
import { AreasLayer } from './layers/AreasLayer.tsx';
import { ContextLayer } from './layers/ContextLayer.tsx';
import { DimensionsLayer } from './layers/DimensionsLayer.tsx';
import { GridLayer } from './layers/GridLayer.tsx';
import { ItemsLayer } from './layers/ItemsLayer.tsx';
import { LabelsLayer } from './layers/LabelsLayer.tsx';
import { LotLayer } from './layers/LotLayer.tsx';
import { OpeningsLayer } from './layers/OpeningsLayer.tsx';
import { RulersLayer } from './layers/RulersLayer.tsx';
import { SunLayer } from './layers/SunLayer.tsx';
import { WallsLayer } from './layers/WallsLayer.tsx';
import { PatternDefs } from './PatternDefs.tsx';
import { type RenderContext, RenderContextProvider } from './RenderContext.ts';
import './SceneSvg.css';

export interface SceneData {
  doc: ProjectDoc;
  scene: Scene;
  /** Committed screen zoom (px per mm) for the pattern LOD; absent in print and thumb modes. */
  pxPerMm?: number;
  /** True while a gesture changes the areas: layers may draw a cheaper preview. */
  live: boolean;
}

const SceneDataContext = createContext<SceneData | null>(null);

/** Doc and scene of the tree being rendered (editor, print sheet or thumbnail). */
export function useSceneData(): SceneData {
  const v = useContext(SceneDataContext);
  if (!v) throw new Error('SceneData missing');
  return v;
}

/** Fills that need a pattern definition: every area fill and the lot ground. */
export function fillsInUse(doc: ProjectDoc): Fill[] {
  return [doc.lot.ground, ...doc.areas.map((a) => a.fill)];
}

/**
 * Every scene layer in paint order, inside the render and scene contexts. The caller provides the
 * `<svg>` root: the editor canvas, the print sheet or `SceneSvg`.
 */
export function SceneLayers({ data, ctx }: { data: SceneData; ctx: RenderContext }): ReactElement {
  const { doc, scene, pxPerMm, live } = data;
  const fills = useMemo(() => fillsInUse(doc), [doc]);
  return (
    <RenderContextProvider value={ctx}>
      <SceneDataContext.Provider value={data}>
        <defs>
          <PatternDefs fills={fills} />
        </defs>
        <ContextLayer lot={doc.lot} ctx={ctx} />
        <LotLayer lot={doc.lot} boundaryGeom={scene.boundaryGeom} ctx={ctx} pxPerMm={pxPerMm} />
        <AreasLayer areas={doc.areas} derived={scene.areas} ctx={ctx} pxPerMm={pxPerMm} />
        <GridLayer lot={doc.lot} ctx={ctx} />
        <WallsLayer
          wallsGeom={scene.wallsGeom}
          wallRects={scene.wallRects}
          areas={doc.areas}
          openBoundaries={doc.openBoundaries}
          live={live}
          ctx={ctx}
        />
        <OpeningsLayer />
        <ItemsLayer />
        {ctx.mode === 'screen' ? <SunLayer /> : null}
        <LabelsLayer areas={doc.areas} derived={scene.areas} ctx={ctx} />
        <DimensionsLayer areas={doc.areas} derived={scene.areas} ctx={ctx} />
        <RulersLayer />
      </SceneDataContext.Provider>
    </RenderContextProvider>
  );
}

/** A standalone scene `<svg>` for print, SVG export and thumbnails. */
export function SceneSvg({
  doc,
  scene,
  ctx,
  viewBox,
  width,
  height,
  background = true,
}: {
  doc: ProjectDoc;
  scene: Scene;
  ctx: RenderContext;
  viewBox: Rect;
  width: number | string;
  height: number | string;
  background?: boolean;
}): ReactElement {
  const data = useMemo<SceneData>(() => ({ doc, scene, live: false }), [doc, scene]);
  const vb = `${viewBox.x0} ${viewBox.y0} ${viewBox.x1 - viewBox.x0} ${viewBox.y1 - viewBox.y0}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={doc.name}
      viewBox={vb}
      width={width}
      height={height}
      preserveAspectRatio="xMidYMid meet"
    >
      {background ? (
        <rect
          x={viewBox.x0}
          y={viewBox.y0}
          width={viewBox.x1 - viewBox.x0}
          height={viewBox.y1 - viewBox.y0}
          fill={ctx.theme.world}
        />
      ) : null}
      <SceneLayers data={data} ctx={ctx} />
    </svg>
  );
}
