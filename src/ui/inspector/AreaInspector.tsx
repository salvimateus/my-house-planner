import { BrickWall, Combine, Copy, Trash2, X } from 'lucide-react';
import type { KeyboardEvent, ReactElement } from 'react';
import { useEffect, useId, useState } from 'react';
import { useStore } from 'zustand';
import { presetsOfKind } from '../../catalog/roomPresets.ts';
import {
  applyPreset,
  mergePickStore,
  rectOf,
  renameArea,
  resizeRect,
  setAreaFill,
  setAreaKind,
  startMergePick,
  stopMergePick,
} from '../../editor/select/area.ts';
import { openWalls, setWallOpen } from '../../editor/select/wall.ts';
import { MIN_ROOM_SIDE } from '../../model/defaults.ts';
import type { AreaKind } from '../../model/types.ts';
import { formatArea } from '../../model/units.ts';
import { useDoc } from '../../store/docStore.ts';
import { useScene } from '../../store/selectors.ts';
import { useUi } from '../../store/uiStore.ts';
import { Button } from '../controls/Button.tsx';
import { Chip } from '../controls/Chip.tsx';
import { FillPicker } from '../controls/FillPicker.tsx';
import { MeasureInput } from '../controls/MeasureInput.tsx';
import { Segmented } from '../controls/Segmented.tsx';
import { chipLabel, PresetIcon } from '../panels/RoomTypePicker.tsx';
import { commands } from '../shortcuts.ts';
import './AreaInspector.css';

const KINDS: { value: AreaKind; label: string }[] = [
  { value: 'room', label: 'Cômodo' },
  { value: 'covered', label: 'Coberta' },
  { value: 'outdoor', label: 'Externa' },
];

const KIND_NOTE: Record<AreaKind, string> = {
  room: 'Fechado com paredes.',
  covered: 'Tem teto, mas não fecha com parede para fora.',
  outdoor: 'Chão do quintal, sem paredes.',
};

const BUILT_PRESETS = [...presetsOfKind('room'), ...presetsOfKind('covered')];
const OUTDOOR_PRESETS = presetsOfKind('outdoor');

/** Inspector of the selected area: name, type, kind, fill, size, areas, merge, removed walls, delete. */
export function AreaInspector(): ReactElement | null {
  const sel = useUi((s) => s.selection);
  const id = sel?.kind === 'area' ? sel.id : null;
  const area = useDoc((s) => (id ? (s.doc?.areas.find((a) => a.id === id) ?? null) : null));
  const doc = useDoc((s) => s.doc);
  const lot = doc?.lot;
  const scene = useScene();
  const picking = useStore(mergePickStore, (s) => s.keepId !== null && s.keepId === id);

  useEffect(() => () => stopMergePick(), []);

  if (!area || !doc || !lot) return null;
  const derived = scene.areas.get(area.id);
  const rect = rectOf(area);
  const presets = area.kind === 'outdoor' ? OUTDOOR_PRESETS : BUILT_PRESETS;
  const removed = openWalls(doc).filter((w) => w.a === area.id || w.b === area.id);
  const removedPairs = [...new Map(removed.map((w) => [`${w.a}|${w.b}`, w])).values()];
  const nameOf = (other: string) => doc.areas.find((a) => a.id === other)?.name ?? 'vizinho';

  return (
    <div className="area-inspector">
      <NameField key={area.name} value={area.name} onCommit={(v) => renameArea(area.id, v)} />

      <section className="area-section" aria-labelledby="area-type-title">
        <h3 id="area-type-title" className="area-section-title">
          Tipo
        </h3>
        <div className="area-chips">
          {presets.map((p) => (
            <Chip
              key={p.id}
              selected={area.preset === p.id}
              icon={<PresetIcon preset={p} />}
              onClick={() => applyPreset(area.id, p.id)}
            >
              {chipLabel(p)}
            </Chip>
          ))}
        </div>
        <Segmented<AreaKind>
          label="Tipo de área"
          showLabel
          options={KINDS}
          value={area.kind}
          onChange={(k) => setAreaKind(area.id, k)}
        />
        <p className="area-note">{KIND_NOTE[area.kind]}</p>
      </section>

      <section className="area-section" aria-labelledby="area-size-title">
        <h3 id="area-size-title" className="area-section-title">
          Medidas
        </h3>
        {rect ? (
          <div className="area-size">
            <MeasureInput
              label="Largura"
              value={rect.x1 - rect.x0}
              min={MIN_ROOM_SIDE}
              max={lot.width - rect.x0}
              onCommit={(v) => resizeRect(area.id, v, rect.y1 - rect.y0)}
            />
            <MeasureInput
              label="Profundidade"
              value={rect.y1 - rect.y0}
              min={MIN_ROOM_SIDE}
              max={lot.depth - rect.y0}
              onCommit={(v) => resizeRect(area.id, rect.x1 - rect.x0, v)}
            />
          </div>
        ) : (
          <p className="area-note">Formato em L ou com recorte: arraste as paredes para mudar.</p>
        )}
        {derived ? (
          <dl className="area-totals">
            <div>
              <dt>Área total</dt>
              <dd className="num">{formatArea(derived.grossArea)}</dd>
            </div>
            <div>
              <dt>{area.kind === 'outdoor' ? 'Área livre' : 'Área útil'}</dt>
              <dd className="num">{formatArea(derived.netArea)}</dd>
            </div>
          </dl>
        ) : null}
        {area.kind !== 'outdoor' ? (
          <p className="area-note">Área útil é o chão que sobra sem as paredes.</p>
        ) : null}
      </section>

      <section className="area-section" aria-labelledby="area-fill-title">
        <h3 id="area-fill-title" className="area-section-title">
          Piso e cor
        </h3>
        <FillPicker
          value={area.fill}
          group={area.kind === 'outdoor' ? 'outdoor' : 'indoor'}
          onChange={(f) => setAreaFill(area.id, f)}
        />
      </section>

      {removedPairs.length ? (
        <section className="area-section" aria-labelledby="area-open-title">
          <h3 id="area-open-title" className="area-section-title">
            Paredes removidas
          </h3>
          {removedPairs.map((w) => {
            const other = w.a === area.id ? w.b : w.a;
            return (
              <Button
                key={`${w.a}|${w.b}`}
                icon={<BrickWall />}
                block
                onClick={() => setWallOpen(w.a, w.b, false)}
              >
                Recolocar parede com {nameOf(other)}
              </Button>
            );
          })}
        </section>
      ) : null}

      <section className="area-section area-actions" aria-label="Ações">
        {picking ? (
          <div className="area-pick" role="status">
            <p>Toque no ambiente vizinho que vai se juntar a este.</p>
            <Button icon={<X />} variant="ghost" onClick={stopMergePick}>
              Cancelar
            </Button>
          </div>
        ) : (
          <Button icon={<Combine />} block onClick={() => startMergePick(area.id)}>
            Juntar com…
          </Button>
        )}
        <Button icon={<Copy />} block onClick={() => commands.duplicateSelection()}>
          Duplicar
        </Button>
        <Button icon={<Trash2 />} variant="danger" block onClick={() => commands.deleteSelection()}>
          Excluir
        </Button>
      </section>

      <p className="area-note">
        Arraste o ambiente selecionado para mover, ou arraste o nome para outro canto.
      </p>
    </div>
  );
}

function NameField({
  value,
  onCommit,
}: {
  value: string;
  onCommit(v: string): void;
}): ReactElement {
  const id = useId();
  const [text, setText] = useState(value);
  const commit = () => {
    if (text.trim()) onCommit(text);
    else setText(value);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setText(value);
    }
  };
  return (
    <div className="area-name">
      <label htmlFor={id} className="area-section-title">
        Nome
      </label>
      <input
        id={id}
        className="area-name-input"
        type="text"
        value={text}
        maxLength={40}
        autoComplete="off"
        enterKeyHint="done"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
