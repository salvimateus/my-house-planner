export type ExportFormat = 'pdf' | 'svg' | 'png';
export type PaperId = 'A4' | 'A3';
/** `lot`: the whole lot; `building`: the built footprint plus 1 m. */
export type SheetFrame = 'lot' | 'building';

export interface ExportOptions {
  paper: PaperId;
  frame: SheetFrame;
  /** Scale denominator (100 = 1:100); null picks the largest drawing that fits. */
  scale: number | null;
  items: boolean;
  /** Internal room dimensions. */
  measures: boolean;
  rulers: boolean;
  /** Width × height labels of doors and windows. */
  openingSizes: boolean;
  /** Lot width and depth outside the lot line. */
  lotSize: boolean;
  /** Neighbor lot lines and street trees; the street and sidewalk always print. */
  context: boolean;
  grid: boolean;
  mono: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  paper: 'A4',
  frame: 'lot',
  scale: null,
  items: true,
  measures: true,
  rulers: true,
  openingSizes: true,
  lotSize: true,
  context: false,
  grid: false,
  mono: false,
};

/** Error with a pt-BR message for the user. */
export class ExportError extends Error {
  userMessage: string;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ExportError';
    this.userMessage = message;
  }
}
