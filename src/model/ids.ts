import { nanoid } from 'nanoid';
import type { Id } from './types.ts';

export const newId = (): Id => nanoid(10);
