/**
 * The choice after `current` in `choices`, wrapping round; the first one
 * when `current` is not among them. A choice may itself be null (the
 * opponent button's "a person, no bot") — Erik's test, 2026-11-01: an
 * `?? current` fallback treated that null as missing and the button
 * stuck on "hard" forever.
 */
export function nextInCycle<T>(choices: readonly T[], current: T): T {
  if (choices.length === 0) {
    return current;
  }
  const next = (choices.indexOf(current) + 1) % choices.length;
  // `next` is always a valid index here.
  return choices[next] as T;
}
