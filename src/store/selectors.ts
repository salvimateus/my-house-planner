import { useMemo } from 'react';
import { itemDef, materialDef } from '../catalog/registry.ts';
import { deriveScene, EMPTY_SCENE } from '../geometry/scene.ts';
import type { CatalogLookup, Scene } from '../geometry/types.ts';
import type { ProjectDoc } from '../model/types.ts';
import { useDoc } from './docStore.ts';

export const catalogLookup: CatalogLookup = {
  itemLayer: (t) => itemDef(t).layer,
  materialPermeable: (id) => materialDef(id).permeable,
};

// Docs are immutable (immer), so one derive per doc reference serves every consumer.
const cache = new WeakMap<ProjectDoc, Scene>();

export const sceneOf = (doc: ProjectDoc | null): Scene => {
  if (!doc) return EMPTY_SCENE;
  let scene = cache.get(doc);
  if (!scene) {
    scene = deriveScene(doc, catalogLookup);
    cache.set(doc, scene);
  }
  return scene;
};

export function useScene(): Scene {
  const doc = useDoc((st) => st.doc);
  return useMemo(() => sceneOf(doc), [doc]);
}
