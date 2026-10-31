/// <reference types="node" />
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { emptyProfileStore, parseProfileStore } from '../src/core/profiles.js';
import type { ProfileStore } from '../src/core/profiles.js';

/** Relative to the repo root. The dev server keeps its own file: two
 * servers on one file would overwrite each other's changes (each holds
 * the store in memory — review, 2026-10-31). */
export const PROFILES_FILE = '.kubb-server/profiles.json';
export const DEV_PROFILES_FILE = '.kubb-server/profiles-dev.json';

/** Where the game server keeps its player profiles. */
export interface ProfileRepository {
  load(): ProfileStore;
  save(store: ProfileStore): void;
}

/** In memory only — tests, and the default when no file is given. */
export function memoryProfileRepository(
  initial: ProfileStore = emptyProfileStore(),
): ProfileRepository & { saved: ProfileStore } {
  const repo = {
    saved: initial,
    load: () => repo.saved,
    save: (store: ProfileStore) => {
      repo.saved = store;
    },
  };
  return repo;
}

/**
 * A JSON file on the server machine (`.kubb-server/profiles.json`,
 * git-ignored — profile names come from a fixed list, nothing else
 * personal is stored). A missing or corrupt file starts a fresh store.
 * Writes go to a temp file renamed over the old one, so a crash mid-
 * write never leaves half a file. Saves are rare (a round, a choice).
 */
export function fileProfileRepository(path: string): ProfileRepository {
  return {
    load: () => {
      try {
        return parseProfileStore(readFileSync(path, 'utf8'));
      } catch {
        return emptyProfileStore();
      }
    },
    save: (store) => {
      mkdirSync(dirname(path), { recursive: true });
      const temp = `${path}.${process.pid}.tmp`;
      writeFileSync(temp, JSON.stringify(store, null, 1));
      renameSync(temp, path);
    },
  };
}
