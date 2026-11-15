import { Link2, Trash2 } from 'lucide-react';
import type { CSSProperties, ReactElement } from 'react';
import {
  findRamp,
  findTree,
  followGate,
  matchingGate,
  setRampWidth,
  setTreeSize,
  setTreeSpecies,
} from '../../editor/select/frontage.ts';
import { RAMP_WIDTH, SPECIES, TREE_SIZE } from '../../geometry/frontage.ts';
import type { ProjectDoc, SidewalkRamp, StreetTree, StreetTreeSpecies } from '../../model/types.ts';
import { formatLength } from '../../model/units.ts';
import { SPECIES_LOOK } from '../../render/streetTree.tsx';
import { useDoc } from '../../store/docStore.ts';
import { useUi } from '../../store/uiStore.ts';
import { Button } from '../controls/Button.tsx';
import { Chip } from '../controls/Chip.tsx';
import { MeasureInput } from '../controls/MeasureInput.tsx';
import { commands } from '../shortcuts.ts';
import './FrontageInspector.css';

export const SPECIES_LABEL: Record<StreetTreeSpecies, string> = {
  'ipe-amarelo': 'Ipê-amarelo',
  'ipe-roxo': 'Ipê-roxo',
  quaresmeira: 'Quaresmeira',
  oiti: 'Oiti',
  reseda: 'Resedá',
};

const SPECIES_NOTE: Record<StreetTreeSpecies, string> = {
  'ipe-amarelo': 'Flores amarelas no fim do inverno.',
  'ipe-roxo': 'Flores rosa-arroxeadas no inverno.',
  quaresmeira: 'Flores roxas no outono, copa pequena.',
  oiti: 'Sempre verde, copa densa e muita sombra.',
  reseda: 'Flores cor-de-rosa no verão, copa pequena.',
};

const swatchOf = (species: StreetTreeSpecies) => {
  const look = SPECIES_LOOK[species];
  return { '--swatch': look.bloom ?? look.leaf, '--swatch-edge': look.leafDark } as CSSProperties;
};

/** Inspector of a street tree or a sidewalk ramp. */
export function FrontageInspector(): ReactElement | null {
  const sel = useUi((s) => s.selection);
  const doc = useDoc((s) => s.doc);
  if (!doc) return null;
  if (sel?.kind === 'street-tree') {
    const tree = findTree(doc, sel.id);
    return tree ? <TreeBody tree={tree} /> : null;
  }
  if (sel?.kind === 'sidewalk-ramp') {
    const ramp = findRamp(doc, sel.id);
    return ramp ? <RampBody ramp={ramp} doc={doc} /> : null;
  }
  return null;
}

function RemoveButton(): ReactElement {
  return (
    <Button variant="danger" icon={<Trash2 />} onClick={() => commands.deleteSelection()} block>
      Excluir
    </Button>
  );
}

function TreeBody({ tree }: { tree: StreetTree }): ReactElement {
  return (
    <div className="frontage-inspector">
      <div className="frontage-head">
        <span className="frontage-swatch" style={swatchOf(tree.species)} aria-hidden="true" />
        <div className="frontage-head-text">
          <span className="frontage-title">{SPECIES_LABEL[tree.species]}</span>
          <span className="frontage-sub">{SPECIES_NOTE[tree.species]}</span>
        </div>
      </div>

      <fieldset className="frontage-field">
        <legend className="frontage-label">Espécie</legend>
        <div className="frontage-chips">
          {SPECIES.map((sp) => (
            <Chip
              key={sp}
              selected={sp === tree.species}
              icon={<span className="frontage-dot" style={swatchOf(sp)} />}
              onClick={() => {
                if (sp !== tree.species) setTreeSpecies(tree.id, sp);
              }}
            >
              {SPECIES_LABEL[sp]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <MeasureInput
        label="Largura da copa"
        value={tree.size}
        min={TREE_SIZE.min}
        max={TREE_SIZE.max}
        step={500}
        onCommit={(v) => setTreeSize(tree.id, v)}
      />
      <p className="frontage-note">
        Fica na faixa de serviço, junto da guia. Arraste para mudar de lugar na calçada.
      </p>
      <RemoveButton />
    </div>
  );
}

function RampBody({ ramp, doc }: { ramp: SidewalkRamp; doc: ProjectDoc }): ReactElement {
  const linked = ramp.gateId !== null && doc.openings.some((o) => o.id === ramp.gateId);
  const gate = linked ? null : matchingGate(doc, ramp);
  return (
    <div className="frontage-inspector">
      <div className="frontage-readout">
        <span className="frontage-length num">{formatLength(ramp.width)}</span>
        <span className="frontage-sub">Rampa para carro, largura na guia</span>
      </div>

      {linked ? (
        <p className="frontage-status" data-linked="true">
          <Link2 aria-hidden="true" />
          Acompanha o portão eletrônico: muda junto quando o portão muda.
        </p>
      ) : gate ? (
        <Button icon={<Link2 />} onClick={() => followGate(ramp.id)} block>
          Seguir o portão
        </Button>
      ) : (
        <p className="frontage-note">Sem portão eletrônico neste muro para acompanhar.</p>
      )}

      <MeasureInput
        label="Largura"
        value={ramp.width}
        min={RAMP_WIDTH.min}
        max={RAMP_WIDTH.max}
        step={100}
        onCommit={(v) => setRampWidth(ramp.id, v)}
        hint="Inclui as abas dos lados."
      />
      <p className="frontage-note">
        A guia fica rebaixada só na faixa de serviço, e o resto da calçada continua plano. Arraste
        para mudar de lugar.
      </p>
      <RemoveButton />
    </div>
  );
}
