import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Loads the server dictionary (one uppercase word per line) into a Set.
 * Any word list works — see README for how to swap in an official
 * Scrabble list (CSW21 / OTCWL).
 */
export function loadDictionary(
  file: string = fileURLToPath(new URL('../data/words.txt', import.meta.url)),
): Set<string> {
  const raw = readFileSync(file, 'utf8');
  const words = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const w = line.trim().toUpperCase();
    if (w) words.add(w);
  }
  if (words.size < 10_000) {
    throw new Error(`dictionary at ${file} looks wrong (only ${words.size} words)`);
  }
  return words;
}
