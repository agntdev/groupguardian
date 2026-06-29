import type { DataStore } from "./store/types.js";
import { resolveDataStore } from "./store/index.js";
import { Repo } from "./store/index.js";

/**
 * Bot-wide singletons: DataStore + Repo, initialized once at boot.
 * The test harness creates a fresh bot per spec so these are always
 * fresh in tests.
 */
let _dataStore: DataStore | undefined;
let _repo: Repo | undefined;

export function getDataStore(): DataStore {
  if (!_dataStore) _dataStore = resolveDataStore();
  return _dataStore;
}

export function getRepo(): Repo {
  if (!_repo) _repo = new Repo(getDataStore());
  return _repo;
}

/** Override the data store (for testing). */
export function _setDataStore(store: DataStore): void {
  _dataStore = store;
  _repo = new Repo(store);
}

/** Reset singletons (test-only). */
export function _resetState(): void {
  _dataStore = undefined;
  _repo = undefined;
}
