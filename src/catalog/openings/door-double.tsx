import type { ReactElement } from 'react';
import { defineOpening, type OpeningSymbolProps } from '../types.ts';
import { HingedLeaves, LEAF_FILL } from './openingKit.ts';

function DoubleDoorSymbol(props: OpeningSymbolProps): ReactElement {
  return (
    <HingedLeaves
      {...props}
      double
      pens={{ leafFill: LEAF_FILL, leafStroke: props.ctx.theme.door }}
    />
  );
}

export default defineOpening({
  type: 'door-double',
  label: 'Porta de 2 folhas',
  tip: 'Duas folhas que abrem do meio. Boa para salas e entradas largas.',
  Symbol: DoubleDoorSymbol,
});
