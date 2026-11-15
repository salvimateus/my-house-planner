import { FORMAT, SCHEMA_VERSION } from './types.ts';

/** Error with a pt-BR message that the UI can show as is. */
export class CodecError extends Error {
  userMessage: string;
  constructor(message: string) {
    super(message);
    this.name = 'CodecError';
    this.userMessage = message;
  }
}

type RawDoc = Record<string, unknown>;
type Migration = (doc: RawDoc) => RawDoc;

/** Key n migrates a v(n) doc to v(n + 1). Each step is pure. */
const MIGRATIONS: Record<number, Migration> = {};

const isRecord = (v: unknown): v is RawDoc =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function migrate(raw: unknown): unknown {
  if (!isRecord(raw) || raw.format !== FORMAT) {
    throw new CodecError('Este arquivo não é uma planta do Casinha.');
  }
  let version = Number(raw.schemaVersion);
  if (!Number.isInteger(version) || version < 1) {
    throw new CodecError('Versão de arquivo desconhecida.');
  }
  if (version > SCHEMA_VERSION) {
    throw new CodecError(
      'Esta planta foi feita numa versão mais nova do Casinha. Recarregue a página e tente de novo.',
    );
  }
  let doc: RawDoc = raw;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new CodecError('Não foi possível atualizar esta planta.');
    doc = { ...step(doc), schemaVersion: version + 1 };
    version += 1;
  }
  return doc;
}
