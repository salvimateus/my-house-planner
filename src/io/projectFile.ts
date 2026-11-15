// placeholder: WP10
import type { ProjectDoc } from '../model/types.ts';

export function downloadProjectFile(_doc: ProjectDoc): void {}

export async function pickProjectFile(): Promise<void> {}

export async function openProjectFile(_file: File): Promise<void> {}
