import type { CSSProperties, ReactElement } from 'react';
import { useEffect } from 'react';
import { on } from '../juice/events.ts';
import { tuning } from '../juice/tuning.ts';
import { useUi } from '../store/uiStore.ts';
import { Coach } from './Coach.tsx';
import { DemoPlayer } from './DemoPlayer.tsx';
import { WallThicknessHost } from './explainers/WallThickness.tsx';
import { NetAreaLesson } from './NetAreaLesson.tsx';
import { resetEducation } from './storage.ts';
import { startContextTips } from './tips.ts';
import './Education.css';

function EditorEducation(): ReactElement {
  useEffect(() => {
    const offTutorial = on('tutorial-requested', resetEducation);
    const offTips = startContextTips();
    return () => {
      offTutorial();
      offTips();
    };
  }, []);

  return (
    <>
      <div className="edu-layer">
        <DemoPlayer />
        <NetAreaLesson />
        <Coach />
      </div>
      <WallThicknessHost />
    </>
  );
}

/**
 * Education above the editor: ghost hand demos, the net area lesson, coach marks, context tips
 * and the wall explainer. The layer never takes pointer events, except on its own small buttons.
 */
export function EducationLayer(): ReactElement | null {
  const screen = useUi((s) => s.screen);
  return screen === 'editor' ? <EditorEducation /> : null;
}

/* ------------------------------------------ start art ------------------------------------------ */

type ArtLine = { d: string; kind: 'wall' | 'thin' | 'dim' | 'tree' };

/** A small house plan in a 640 × 420 box: lot, walls, doors, windows, trees and a dimension. */
const ART_LINES: ArtLine[] = [
  { d: 'M120 40H520V400H120Z', kind: 'thin' },
  { d: 'M180 96H460V330H180Z', kind: 'wall' },
  { d: 'M322 96V196', kind: 'wall' },
  { d: 'M322 236V330', kind: 'wall' },
  { d: 'M180 214H262', kind: 'wall' },
  { d: 'M296 214H322', kind: 'wall' },
  { d: 'M322 262H384', kind: 'wall' },
  { d: 'M418 262H460', kind: 'wall' },
  { d: 'M262 214V248A34 34 0 0 0 296 214', kind: 'thin' },
  { d: 'M322 196H362A40 40 0 0 1 322 236', kind: 'thin' },
  { d: 'M384 262V296A34 34 0 0 0 418 262', kind: 'thin' },
  { d: 'M236 330V362A32 32 0 0 0 268 330', kind: 'thin' },
  { d: 'M210 92H266M210 100H266', kind: 'thin' },
  { d: 'M370 92H430M370 100H430', kind: 'thin' },
  { d: 'M456 150V196M464 150V196', kind: 'thin' },
  { d: 'M180 70H460M180 63V77M460 63V77', kind: 'dim' },
  { d: 'M150 132m-24 0a24 24 0 1 0 48 0a24 24 0 1 0 -48 0', kind: 'tree' },
  { d: 'M490 362m-18 0a18 18 0 1 0 36 0a18 18 0 1 0 -36 0', kind: 'tree' },
];

const ART_ROOMS = [
  { x: 180, y: 96, w: 142, h: 118 },
  { x: 322, y: 96, w: 138, h: 166 },
  { x: 180, y: 214, w: 142, h: 116 },
  { x: 322, y: 262, w: 138, h: 68 },
];

/** Behind the start screen title: the mini plan draws itself once, line by line. */
export function StartScreenArt(): ReactElement {
  const { drawMs, staggerMs } = tuning.startArt;
  const lines = ART_LINES.length;
  return (
    <svg
      className="start-art-svg"
      viewBox="0 0 640 420"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
      style={
        {
          '--draw-ms': `${drawMs}ms`,
          '--stagger-ms': `${staggerMs}ms`,
          '--fill-delay': `${drawMs * 0.6 + lines * staggerMs}ms`,
        } as CSSProperties
      }
    >
      <g className="start-art-rooms">
        {ART_ROOMS.map((r) => (
          <rect key={`${r.x},${r.y}`} x={r.x} y={r.y} width={r.w} height={r.h} />
        ))}
      </g>
      {ART_LINES.map((l, i) => (
        <path
          key={l.d}
          d={l.d}
          pathLength={1}
          className={`start-art-line start-art-${l.kind}`}
          style={{ '--i': i } as CSSProperties}
        />
      ))}
    </svg>
  );
}
