import type { ReactElement } from 'react';
import { defineOpening, type OpeningSymbolProps } from '../types.ts';
import { HingedLeaves, LEAF_FILL } from './openingKit.ts';

function DoorSymbol(props: OpeningSymbolProps): ReactElement {
  return (
    <HingedLeaves
      {...props}
      double={false}
      pens={{ leafFill: LEAF_FILL, leafStroke: props.ctx.theme.door }}
    />
  );
}

export default defineOpening({
  type: 'door',
  label: 'Porta de abrir',
  tip: 'A mais comum. Precisa de espaço livre para a folha girar.',
  Symbol: DoorSymbol,
});
