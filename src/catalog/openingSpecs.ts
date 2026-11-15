import type { WallKind } from '../geometry/types.ts';
import type { Mm, OpeningType } from '../model/types.ts';

export interface OpeningSpec {
  group: 'door' | 'window' | 'gate';
  hosts: WallKind[];
  widths: Mm[];
  defaultWidth: Mm;
  minWidth: Mm;
  maxWidth: Mm;
  height: Mm;
  sill: Mm;
  hasSwing: boolean;
}

const house: WallKind[] = ['internal', 'external'];

export const OPENING_SPECS: Record<OpeningType, OpeningSpec> = {
  door: {
    group: 'door',
    hosts: house,
    widths: [600, 700, 800, 900],
    defaultWidth: 800,
    minWidth: 600,
    maxWidth: 1000,
    height: 2100,
    sill: 0,
    hasSwing: true,
  },
  'door-double': {
    group: 'door',
    hosts: house,
    widths: [1200, 1400, 1600],
    defaultWidth: 1400,
    minWidth: 1000,
    maxWidth: 2000,
    height: 2100,
    sill: 0,
    hasSwing: true,
  },
  'door-sliding': {
    group: 'door',
    hosts: house,
    widths: [800, 900, 1200],
    defaultWidth: 800,
    minWidth: 600,
    maxWidth: 2400,
    height: 2100,
    sill: 0,
    hasSwing: false,
  },
  'door-balcony': {
    group: 'door',
    hosts: ['external'],
    widths: [1500, 2000, 2500],
    defaultWidth: 2000,
    minWidth: 1200,
    maxWidth: 4000,
    height: 2100,
    sill: 0,
    hasSwing: false,
  },
  passage: {
    group: 'door',
    hosts: house,
    widths: [800, 900, 1200, 1500],
    defaultWidth: 900,
    minWidth: 800,
    maxWidth: 3000,
    height: 2100,
    sill: 0,
    hasSwing: false,
  },
  'window-sliding': {
    group: 'window',
    hosts: ['external'],
    widths: [1000, 1200, 1500, 2000],
    defaultWidth: 1200,
    minWidth: 600,
    maxWidth: 3000,
    height: 1000,
    sill: 1100,
    hasSwing: false,
  },
  'window-tilt': {
    group: 'window',
    hosts: ['external'],
    widths: [600, 800],
    defaultWidth: 600,
    minWidth: 400,
    maxWidth: 1200,
    height: 600,
    sill: 1500,
    hasSwing: false,
  },
  'window-maxim': {
    group: 'window',
    hosts: ['external'],
    widths: [600, 800, 1000],
    defaultWidth: 800,
    minWidth: 400,
    maxWidth: 1500,
    height: 600,
    sill: 1500,
    hasSwing: false,
  },
  'window-fixed': {
    group: 'window',
    hosts: ['external'],
    widths: [1000],
    defaultWidth: 1000,
    minWidth: 300,
    maxWidth: 4000,
    height: 1000,
    sill: 1100,
    hasSwing: false,
  },
  'gate-pedestrian': {
    group: 'gate',
    hosts: ['boundary'],
    widths: [1000],
    defaultWidth: 1000,
    minWidth: 800,
    maxWidth: 1500,
    height: 2000,
    sill: 0,
    hasSwing: true,
  },
  'gate-sliding': {
    group: 'gate',
    hosts: ['boundary'],
    widths: [3000, 3500, 4000, 5000],
    defaultWidth: 3500,
    minWidth: 2500,
    maxWidth: 6000,
    height: 2300,
    sill: 0,
    hasSwing: false,
  },
  'gate-tilt': {
    group: 'gate',
    hosts: ['boundary'],
    widths: [3000],
    defaultWidth: 3000,
    minWidth: 2500,
    maxWidth: 5000,
    height: 2300,
    sill: 0,
    hasSwing: false,
  },
};
