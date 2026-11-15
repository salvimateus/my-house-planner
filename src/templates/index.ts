// placeholder: WP13
import type { ProjectDoc } from '../model/types.ts';

export type TemplateEntry = {
  id: string;
  title: string;
  description: string;
  load(): Promise<ProjectDoc>;
};

export const TEMPLATES: TemplateEntry[] = [];
