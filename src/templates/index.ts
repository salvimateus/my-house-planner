import { MATERIALS } from '../catalog/registry.ts';
import { parseProject } from '../model/codec.ts';
import type { ProjectDoc } from '../model/types.ts';

export type TemplateEntry = {
  id: string;
  title: string;
  description: string;
  load(): Promise<ProjectDoc>;
};

/** Parses a template file like any imported file: a new id and the same checks. */
const fromText = (text: string): ProjectDoc =>
  parseProject(text, { newId: true, isKnownMaterial: (id) => MATERIALS.has(id) }).doc;

// Files written by `npm run templates` (scripts/build-templates.ts).
export const TEMPLATES: TemplateEntry[] = [
  {
    id: 'casa-terrea-10x25',
    title: 'Casa térrea 10×25',
    description:
      '3 quartos com suíte, sala integrada à cozinha, garagem para 2 carros e quintal com churrasqueira.',
    load: async () => fromText((await import('./casa-terrea-10x25.casinha.json?raw')).default),
  },
  {
    id: 'casa-geminada-5x25',
    title: 'Casa geminada 5×25',
    description: '2 quartos, corredor lateral, cozinha aberta para a sala e vaga para 1 carro.',
    load: async () => fromText((await import('./casa-geminada-5x25.casinha.json?raw')).default),
  },
  {
    id: 'casa-esquina-12x30',
    title: 'Casa de esquina 12×30',
    description: '3 quartos com suíte, piscina com deck, área gourmet coberta e jardim de esquina.',
    load: async () => fromText((await import('./casa-esquina-12x30.casinha.json?raw')).default),
  },
];
