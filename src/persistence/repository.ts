// placeholder: WP10
import type { Id, NewProjectInput, ProjectDoc, ProjectMeta } from '../model/types.ts';

export function useProjectList(): { projects: ProjectMeta[]; ready: boolean } {
  return { projects: [], ready: true };
}

export async function openProject(_id: Id): Promise<void> {}

export async function newProject(_input: NewProjectInput): Promise<void> {}

export async function openDocAsCopy(_doc: ProjectDoc): Promise<void> {}

export async function duplicateCurrentAsIdea(): Promise<void> {}

export async function renameProject(_id: Id, _name: string): Promise<void> {}

export async function deleteProject(_id: Id): Promise<void> {}

export async function closeProject(): Promise<void> {}
