import { ChevronDown, ChevronUp, Lightbulb, Pause, Play, X } from 'lucide-react';
import { type CSSProperties, type ReactElement, useId, useMemo, useState } from 'react';
import {
  cardinalOf,
  formatClock,
  formatHour,
  type RoomSun,
  sunPosition,
  sunSummary,
  sunTimes,
} from '../geometry/sun.ts';
import { sunModelOf } from '../render/layers/SunLayer.tsx';
import { useDoc } from '../store/docStore.ts';
import { useScene } from '../store/selectors.ts';
import {
  SEASONS,
  type Season,
  SUN_MAX_MINUTES,
  SUN_MIN_MINUTES,
  SUN_STEP_MINUTES,
  useSun,
} from '../store/sunStore.ts';
import './SunBar.css';

const SUMMARY_KEY = 'casinha:sun-summary-open';

function readSummaryOpen(): boolean {
  try {
    return localStorage.getItem(SUMMARY_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSummaryOpen(open: boolean): void {
  try {
    localStorage.setItem(SUMMARY_KEY, open ? '1' : '0');
  } catch {
    // Storage blocked: the choice lasts for this session only.
  }
}

const SPAN = SUN_MAX_MINUTES - SUN_MIN_MINUTES;
const pct = (m: number) =>
  `${(Math.min(1, Math.max(0, (m - SUN_MIN_MINUTES) / SPAN)) * 100).toFixed(1)}%`;
const quarter = (m: number) => Math.round(m / 15) * 15;
const pad2 = (n: number) => String(n).padStart(2, '0');
const whenOf = (s: Season) => `${pad2(s.date.day)}/${pad2(s.date.month)}`;

function joinPt(parts: string[]): string {
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

function roomLine(r: RoomSun): string {
  if (!r.ranges.length) return 'sem sol direto nesse dia';
  const parts = r.ranges.map(([a, b]) => {
    const from = quarter(a);
    const to = Math.max(from + 15, quarter(b));
    return `das ${formatHour(from)} às ${formatHour(to)}`;
  });
  return `sol ${joinPt(parts)}`;
}

const isBedroom = (r: RoomSun) => r.preset === 'bedroom' || r.preset === 'suite';
const hasMorning = (r: RoomSun) => r.ranges.some(([a]) => a < 12 * 60);
const hasLateAfternoon = (r: RoomSun) => r.ranges.some(([, b]) => b > 15 * 60);

function tipFor(rooms: RoomSun[]): string {
  if (!rooms.length) return 'Desenhe os cômodos e as janelas para ver por onde o sol entra.';
  const beds = rooms.filter(isBedroom);
  if (beds.some((r) => !hasMorning(r) && hasLateAfternoon(r))) {
    return 'Quarto com sol só à tarde pode ficar quente à noite. Uma cortina ou um brise ajuda.';
  }
  if (!rooms.some((r) => r.ranges.length)) {
    return 'Janelas voltadas para o norte costumam receber mais sol no inverno.';
  }
  return 'Quartos costumam ficar agradáveis com sol da manhã.';
}

/** Sky dial in plan orientation: north follows the lot, the dot is the sun (center = straight up). */
function SunCompass({
  azimuth,
  elevation,
  northDeg,
  night,
}: {
  azimuth: number;
  elevation: number;
  northDeg: number;
  night: boolean;
}): ReactElement {
  const b = ((azimuth + northDeg) * Math.PI) / 180;
  const rr = 13 * (1 - Math.max(0, elevation) / 90);
  const sx = Math.sin(b) * rr;
  const sy = -Math.cos(b) * rr;
  return (
    <svg className="sun-compass" viewBox="-20 -20 40 40" aria-hidden="true" focusable="false">
      <circle className="sun-compass-ring" r={17} />
      <g transform={`rotate(${northDeg})`}>
        <path className="sun-compass-needle" d="M0 -17 L2.6 -11.5 L-2.6 -11.5 Z" />
        <text className="sun-compass-n" y={-5.2} textAnchor="middle">
          N
        </text>
      </g>
      {night ? (
        <circle className="sun-compass-night" r={3.2} />
      ) : (
        <>
          <line className="sun-compass-ray" x1={0} y1={0} x2={sx} y2={sy} />
          <circle className="sun-compass-sun" cx={sx} cy={sy} r={3.6} />
        </>
      )}
    </svg>
  );
}

/** Floating sun study controls: time of day, season, play, compass and the sun per room. */
export function SunBar({ compact }: { compact: boolean }): ReactElement {
  const date = useSun((s) => s.date);
  const minutes = useSun((s) => s.minutes);
  const playing = useSun((s) => s.playing);
  const setMinutes = useSun((s) => s.setMinutes);
  const setDate = useSun((s) => s.setDate);
  const play = useSun((s) => s.play);
  const pause = useSun((s) => s.pause);
  const close = useSun((s) => s.close);
  const doc = useDoc((s) => s.doc);
  const scene = useScene();
  const [open, setOpen] = useState(readSummaryOpen);
  const panelId = useId();

  const times = useMemo(() => sunTimes(date), [date]);
  const pos = sunPosition(date, minutes);
  const night = minutes < times.sunrise || minutes > times.sunset || Math.round(pos.elevation) <= 0;
  const northDeg = doc?.lot.northDeg ?? 0;
  const summary = useMemo(
    () => (open && doc ? sunSummary(sunModelOf(doc, scene), date, northDeg) : null),
    [open, doc, scene, date, northDeg],
  );
  const season = SEASONS.find((x) => x.date.month === date.month && x.date.day === date.day);
  const clock = formatClock(minutes);
  const status = night
    ? 'Sol abaixo do horizonte'
    : `Altura ${Math.round(pos.elevation)}° · ${cardinalOf(pos.azimuth)}`;
  const track = {
    '--sun-rise': pct(times.sunrise),
    '--sun-set': pct(times.sunset),
  } as CSSProperties;

  return (
    <section
      className="sun-bar"
      data-compact={compact ? 'true' : undefined}
      aria-label="Sol e sombra"
    >
      {summary ? (
        <div className="sun-summary" id={panelId}>
          <h2 className="sun-summary-title">Sol nos cômodos</h2>
          {summary.length ? (
            <ul className="sun-summary-list">
              {summary.map((r) => (
                <li key={r.id} data-sun={r.ranges.length ? 'true' : undefined}>
                  <strong>{r.name}:</strong> {roomLine(r)}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="sun-tip">
            <Lightbulb aria-hidden="true" />
            <span>{tipFor(summary)}</span>
          </p>
        </div>
      ) : null}

      <div className="sun-row">
        <button
          type="button"
          className="sun-btn sun-play"
          aria-label={playing ? 'Pausar' : 'Ver o dia passar'}
          title={playing ? 'Pausar' : 'Ver o dia passar'}
          onClick={playing ? pause : play}
        >
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>
        <input
          className="sun-range"
          type="range"
          min={SUN_MIN_MINUTES}
          max={SUN_MAX_MINUTES}
          step={SUN_STEP_MINUTES}
          value={minutes}
          style={track}
          aria-label="Hora do dia"
          aria-valuetext={clock}
          onChange={(e) => setMinutes(Number(e.currentTarget.value))}
        />
        <output className="sun-clock num" aria-live="off">
          {clock}
        </output>
      </div>

      <div className="sun-row sun-info">
        <SunCompass
          azimuth={pos.azimuth}
          elevation={pos.elevation}
          northDeg={northDeg}
          night={night}
        />
        <select
          className="sun-season-select"
          aria-label="Estação"
          title="Estação"
          value={season?.id ?? ''}
          onChange={(e) => {
            const next = SEASONS.find((x) => x.id === e.currentTarget.value);
            if (next) setDate(next.date);
          }}
        >
          {SEASONS.map((x) => (
            <option key={x.id} value={x.id}>
              {`${x.label} · ${whenOf(x)}`}
            </option>
          ))}
        </select>
        <span className="sun-status" data-night={night ? 'true' : undefined}>
          {status}
        </span>
        <div className="sun-actions">
          <button
            type="button"
            className="sun-btn sun-more"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            aria-label="Sol nos cômodos"
            title="Sol nos cômodos"
            onClick={() => {
              const next = !open;
              setOpen(next);
              writeSummaryOpen(next);
            }}
          >
            {open ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
            {compact ? null : <span>Cômodos</span>}
          </button>
          <button
            type="button"
            className="sun-btn sun-close"
            aria-label="Fechar"
            title="Fechar"
            onClick={close}
          >
            <X aria-hidden="true" />
            {compact ? null : <span>Fechar</span>}
          </button>
        </div>
      </div>

      <fieldset className="sun-seasons">
        <legend className="sr-only">Época do ano</legend>
        {SEASONS.map((s) => {
          const active = s.date.month === date.month && s.date.day === date.day;
          const when = whenOf(s);
          return (
            <button
              key={s.id}
              type="button"
              className="sun-chip"
              aria-pressed={active}
              title={`${s.label}, ${when}`}
              onClick={() => setDate(s.date)}
            >
              <span className="sun-chip-name">{s.label}</span>
              <span className="sun-chip-date num">{when}</span>
            </button>
          );
        })}
      </fieldset>
    </section>
  );
}
