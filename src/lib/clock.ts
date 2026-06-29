/**
 * Injectable clock seam. Route EVERY time-based decision through `now()`
 * instead of calling `new Date()` / `Date.now()` inline. Tests override
 * this to drive time-based behavior deterministically.
 */
let _now: () => number = () => Date.now();

/** Current unix-ms timestamp. Override via `_setClock` in tests. */
export function now(): number {
  return _now();
}

/** Override the clock for testing. Pass `undefined` to restore default. */
export function _setClock(override?: () => number): void {
  _now = override ?? (() => Date.now());
}
