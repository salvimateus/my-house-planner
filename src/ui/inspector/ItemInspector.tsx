import {
  BringToFront,
  Copy,
  FlipHorizontal2,
  RotateCcw,
  RotateCw,
  Ruler,
  SendToBack,
  Trash2,
} from 'lucide-react';
import type { KeyboardEvent, ReactElement, ReactNode } from 'react';
import { useEffect, useId, useMemo, useState } from 'react';
import { itemDef } from '../../catalog/registry.ts';
import type { ItemDef } from '../../catalog/types.ts';
import {
  fixedAxes,
  fixedSize,
  normalizeRotation,
  restackItems,
  rotateItemsBy,
  setItemColor,
  setItemLabel,
  setItemRotation,
  setItemSize,
  setItemVariant,
  toggleMirror,
} from '../../editor/select/item.ts';
import type { Item, Mm } from '../../model/types.ts';
import { formatLengthShort } from '../../model/units.ts';
import { useDoc } from '../../store/docStore.ts';
import { useUi } from '../../store/uiStore.ts';
import { Button } from '../controls/Button.tsx';
import { Chip } from '../controls/Chip.tsx';
import { IconButton } from '../controls/IconButton.tsx';
import { MeasureInput } from '../controls/MeasureInput.tsx';
import { Swatch } from '../controls/Swatch.tsx';
import { CATEGORY_LABEL, ItemPreview } from '../panels/CatalogPanel.tsx';
import { commands } from '../shortcuts.ts';
import './ItemInspector.css';

const EMPTY: Item[] = [];

function useSelectedItems(): Item[] {
  const ids = useUi((s) => (s.selection?.kind === 'item' ? s.selection.ids : null));
  const items = useDoc((s) => s.doc?.items ?? EMPTY);
  return useMemo(() => {
    if (!ids) return EMPTY;
    const set = new Set(ids);
    return items.filter((i) => set.has(i.id));
  }, [ids, items]);
}

/** Degrees typed by the user: "45", "45°" or "-90". */
function parseDegrees(text: string): number | null {
  const t = text.trim().replace(/°$/, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return normalizeRotation(Number(t));
}

function RotationInput({ value, onCommit }: { value: number; onCommit(deg: number): void }) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [error, setError] = useState(false);

  useEffect(() => {
    setText(String(value));
    setError(false);
  }, [value]);

  const commit = () => {
    const v = parseDegrees(text);
    if (v === null) {
      setError(true);
      return;
    }
    setError(false);
    setText(String(v));
    if (v !== value) onCommit(v);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape' && text !== String(value)) {
      e.preventDefault();
      e.stopPropagation();
      setText(String(value));
      setError(false);
    }
  };

  return (
    <div className="item-rotation-field" data-invalid={error ? 'true' : undefined}>
      <label htmlFor={id} className="sr-only">
        Ângulo em graus
      </label>
      <input
        id={id}
        className="item-rotation-input num"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="done"
        value={text}
        aria-invalid={error || undefined}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      <span className="item-rotation-unit" aria-hidden="true">
        °
      </span>
    </div>
  );
}

function LabelInput({ item, def }: { item: Item; def: ItemDef }): ReactElement {
  const id = useId();
  const current = item.label ?? '';
  const [text, setText] = useState(current);

  useEffect(() => setText(current), [current]);

  const commit = () => {
    if (text.trim() !== current) setItemLabel(item.id, text);
  };

  return (
    <div className="item-field">
      <label htmlFor={id} className="item-field-label">
        Nome
      </label>
      <input
        id={id}
        className="item-text-input"
        type="text"
        autoComplete="off"
        enterKeyHint="done"
        maxLength={60}
        placeholder={def.label}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
            e.currentTarget.blur();
          } else if (e.key === 'Escape' && text !== current) {
            e.stopPropagation();
            setText(current);
          }
        }}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  const id = useId();
  return (
    <section className="item-section" aria-labelledby={id}>
      <h3 id={id} className="item-section-title">
        {title}
      </h3>
      {children}
    </section>
  );
}

function RotateRow({ items, single }: { items: Item[]; single: Item | null }): ReactElement {
  const ids = items.map((i) => i.id);
  const mirrored = items.every((i) => i.mirrored);
  return (
    <div className="item-rotate-row">
      <IconButton
        label="Girar 90° para a esquerda"
        icon={<RotateCcw />}
        variant="surface"
        onClick={() => rotateItemsBy(ids, -90)}
      />
      {single ? (
        <RotationInput value={single.rotation} onCommit={(v) => setItemRotation(ids, v)} />
      ) : null}
      <IconButton
        label="Girar 90° para a direita"
        icon={<RotateCw />}
        variant="surface"
        onClick={() => rotateItemsBy(ids, 90)}
      />
      <Button
        className="item-mirror"
        icon={<FlipHorizontal2 />}
        aria-pressed={mirrored}
        onClick={() => toggleMirror(ids)}
      >
        Espelhar
      </Button>
    </div>
  );
}

function Actions({ items }: { items: Item[] }): ReactElement {
  const ids = items.map((i) => i.id);
  return (
    <div className="item-actions">
      <Button icon={<Copy />} onClick={() => commands.duplicateSelection()}>
        Duplicar
      </Button>
      <Button variant="danger" icon={<Trash2 />} onClick={() => commands.deleteSelection()}>
        Excluir
      </Button>
      <Button icon={<BringToFront />} onClick={() => restackItems(ids, 'front')}>
        Trazer para frente
      </Button>
      <Button icon={<SendToBack />} onClick={() => restackItems(ids, 'back')}>
        Enviar para trás
      </Button>
    </div>
  );
}

function ColorRow({ items, def }: { items: Item[]; def: ItemDef }): ReactElement {
  const colors = def.colors?.length ? def.colors : [def.color];
  const current = (items[0]?.color ?? def.color).toUpperCase();
  const same = items.every((i) => (i.color ?? def.color).toUpperCase() === current);
  const ids = items.map((i) => i.id);
  return (
    <div className="item-colors">
      {colors.map((c, n) => (
        <Swatch
          key={c}
          color={c}
          label={
            n === 0 && c.toUpperCase() === def.color.toUpperCase() ? 'Cor original' : `Cor ${n + 1}`
          }
          selected={same && c.toUpperCase() === current}
          onClick={() => setItemColor(ids, c)}
        />
      ))}
    </div>
  );
}

function FixedSize({ size }: { size: { w: Mm; d: Mm } }): ReactElement {
  return (
    <p className="item-fixed-size">
      <Ruler className="item-fixed-size-icon" aria-hidden="true" />
      <span>
        <strong className="item-fixed-size-value num">
          {formatLengthShort(size.w)} × {formatLengthShort(size.d)} m
        </strong>
        <span className="item-fixed-size-tag"> · tamanho real</span>
      </span>
    </p>
  );
}

function FixedAxis({ label, value }: { label: string; value: Mm }): ReactElement {
  return (
    <p className="item-fixed-size">
      <Ruler className="item-fixed-size-icon" aria-hidden="true" />
      <span>
        {label} <strong className="item-fixed-size-value num">{formatLengthShort(value)} m</strong>
        <span className="item-fixed-size-tag"> · fixa</span>
      </span>
    </p>
  );
}

function SingleItem({ item }: { item: Item }): ReactElement {
  const def = itemDef(item.type);
  const axes = fixedAxes(def);
  const fixed = fixedSize(def);
  // Only the variants that keep the fixed axes stay on offer.
  const variants = (def.variants ?? []).filter(
    (v) => (axes.w === null || v.w === axes.w) && (axes.d === null || v.d === axes.d),
  );
  const shown = { w: axes.w ?? item.w, d: axes.d ?? item.d };
  const depthLabel = axes.w !== null ? 'Comprimento' : 'Profundidade';
  return (
    <>
      <div className="item-identity">
        <span className="item-identity-thumb">
          <ItemPreview
            def={def}
            w={shown.w}
            d={shown.d}
            color={item.color}
            mirrored={item.mirrored}
            className="item-identity-preview"
          />
        </span>
        <div className="item-identity-text">
          <p className="item-identity-name">{item.label ?? def.label}</p>
          <p className="item-identity-sub">
            {item.label ? `${def.label} · ` : ''}
            {CATEGORY_LABEL[def.category]}
          </p>
        </div>
      </div>

      <LabelInput item={item} def={def} />

      {variants.length > 0 ? (
        <Section title="Modelo">
          <div className="item-chips">
            {variants.map((v) => (
              <Chip
                key={v.id}
                selected={item.variant === v.id}
                onClick={() => setItemVariant(item.id, v.id)}
              >
                {v.label}
              </Chip>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Medidas">
        {fixed ? (
          <FixedSize size={fixed} />
        ) : (
          <>
            {axes.w !== null ? <FixedAxis label="Largura" value={axes.w} /> : null}
            {axes.d !== null ? <FixedAxis label={depthLabel} value={axes.d} /> : null}
            <div className="item-size">
              {axes.w === null ? (
                <MeasureInput
                  label="Largura"
                  unit="cm"
                  value={shown.w}
                  min={def.min.w}
                  max={def.max.w}
                  onCommit={(w) => setItemSize(item.id, w, shown.d)}
                />
              ) : null}
              {axes.d === null ? (
                <MeasureInput
                  label={depthLabel}
                  unit="cm"
                  value={shown.d}
                  min={def.min.d}
                  max={def.max.d}
                  onCommit={(d) => setItemSize(item.id, shown.w, d)}
                />
              ) : null}
            </div>
            {def.keepAspect ? (
              <p className="item-note">Largura e profundidade mudam juntas, na mesma proporção.</p>
            ) : null}
          </>
        )}
      </Section>

      <Section title="Posição">
        <RotateRow items={[item]} single={item} />
      </Section>

      {def.colorable ? (
        <Section title="Cor">
          <ColorRow items={[item]} def={def} />
        </Section>
      ) : null}

      <Actions items={[item]} />
    </>
  );
}

function ManyItems({ items }: { items: Item[] }): ReactElement {
  const types = new Set(items.map((i) => i.type));
  const first = items[0];
  const def = first && types.size === 1 ? itemDef(first.type) : null;
  return (
    <>
      <p className="item-note">
        {items.length} objetos selecionados. As mudanças valem para todos. Arraste qualquer um para
        mover o grupo.
      </p>
      <Section title="Posição">
        <RotateRow items={items} single={null} />
      </Section>
      {def?.colorable ? (
        <Section title="Cor">
          <ColorRow items={items} def={def} />
        </Section>
      ) : null}
      <Actions items={items} />
    </>
  );
}

/** Inspector of the selected items: one item gets the full editor, several share the actions. */
export function ItemInspector(): ReactElement | null {
  const items = useSelectedItems();
  const first = items[0];
  if (!first) return null;
  return (
    <div className="item-inspector">
      {items.length === 1 ? (
        <SingleItem key={first.id} item={first} />
      ) : (
        <ManyItems items={items} />
      )}
    </div>
  );
}
