import type { Id } from '../model/types.ts';

export interface ProjectLock {
  granted: boolean;
  release(): void;
}

const lockName = (id: Id) => `project:${id}`;

const hasLocks = (): boolean =>
  typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks !== undefined;

/** Takes the project lock only when no other tab holds it, and keeps it until `release()`. */
export async function acquireProjectLock(id: Id): Promise<ProjectLock> {
  // Insecure context (LAN over http): no Web Locks, so every tab can edit.
  if (!hasLocks()) return { granted: true, release() {} };
  try {
    return await new Promise<ProjectLock>((resolve, reject) => {
      navigator.locks
        .request(lockName(id), { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve({ granted: false, release() {} });
            return undefined;
          }
          return new Promise<void>((done) => {
            let released = false;
            resolve({
              granted: true,
              release() {
                if (released) return;
                released = true;
                done();
              },
            });
          });
        })
        .catch(reject);
    });
  } catch {
    return { granted: true, release() {} };
  }
}

/**
 * Waits until the other tab lets the lock go, then holds it like `acquireProjectLock`.
 * Resolves with null when aborted or when Web Locks are missing.
 */
export function waitForProjectLock(id: Id, signal: AbortSignal): Promise<ProjectLock | null> {
  if (!hasLocks()) return Promise.resolve(null);
  return new Promise<ProjectLock | null>((resolve) => {
    navigator.locks
      .request(lockName(id), { signal }, (lock) => {
        if (!lock || signal.aborted) {
          resolve(null);
          return undefined;
        }
        return new Promise<void>((done) => {
          let released = false;
          resolve({
            granted: true,
            release() {
              if (released) return;
              released = true;
              done();
            },
          });
        });
      })
      .catch(() => resolve(null));
  });
}
