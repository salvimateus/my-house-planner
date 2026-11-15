import type { Mm } from './types.ts';

const fmt2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const roundMm = (v: number): Mm => Math.round(v);
export const toMm = (meters: number): Mm => Math.round(meters * 1000);
/** Integer rounding first: 2825 mm → 283 cm → "2,83". */
export const formatLengthShort = (mm: Mm): string => fmt2.format(Math.round(mm / 10) / 100);
export const formatLength = (mm: Mm): string => `${formatLengthShort(mm)} m`;
/** 10 735 000 mm² → 1074 hundredths → "10,74 m²". */
export const formatArea = (mm2: number): string =>
  `${fmt2.format(Math.round(mm2 / 10_000) / 100)} m²`;
export const formatCm = (mm: Mm): string => String(Math.round(mm / 10));
export const formatOpening = (w: Mm, h: Mm): string => `${formatCm(w)}×${formatCm(h)}`;

export function parseMeters(text: string): Mm | null {
  const t = text.trim().toLowerCase().replace(/\s*m$/, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return toMm(Number(t));
}
