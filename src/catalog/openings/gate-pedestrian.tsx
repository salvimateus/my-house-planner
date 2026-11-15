import type { ReactElement } from 'react';
import { defineOpening, type OpeningSymbolProps } from '../types.ts';
import { gateFill, HingedLeaves } from './openingKit.ts';

/** Pedestrian gate: a metal swing leaf in the muro. */
function PedestrianGateSymbol(props: OpeningSymbolProps): ReactElement {
  return (
    <HingedLeaves
      {...props}
      double={false}
      leafThickness={50}
      pens={{ leafFill: gateFill(props.ctx), leafStroke: props.ctx.theme.door }}
    />
  );
}

export default defineOpening({
  type: 'gate-pedestrian',
  label: 'Portão social',
  tip: 'Portão de pessoas, de abrir. Vai no muro.',
  Symbol: PedestrianGateSymbol,
});
