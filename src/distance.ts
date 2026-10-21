/**
 * Optimal string alignment distance (restricted Damerau-Levenshtein): the
 * fewest insertions, deletions, substitutions and swaps of two ADJACENT
 * characters that turn one string into the other, no substring edited twice.
 *
 * Why this and not Levenshtein or Sift: a swapped pair (`gmial`, `hotmial`)
 * is the most common typing error after a single wrong key (Damerau 1964
 * counted the four operations as over 80% of misspellings), and plain
 * Levenshtein charges it 2, the same as two unrelated mistakes, so a
 * threshold of 1 misses it and a threshold of 2 admits far more noise.
 * mailcheck and @zootools/email-spell-checker use Sift3/Sift4, fast
 * approximations whose result can exceed the true edit distance; the strings
 * here are under 64 characters and the candidate list is a few hundred long,
 * so the exact answer costs nothing.
 *
 * Returns `max + 1` as soon as the distance is known to exceed `max`.
 */
export function osaDistance(a: string, b: string, max: number = Number.POSITIVE_INFINITY): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const width = b.length + 1;
  // Three rolling rows: two back for the transposition, one back, current.
  let twoBack = new Array<number>(width).fill(0);
  let oneBack = Array.from({ length: width }, (_, j) => j);
  let current = new Array<number>(width).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min((oneBack[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (oneBack[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, (twoBack[j - 2] ?? 0) + 1);
      }
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    [twoBack, oneBack, current] = [oneBack, current, twoBack];
  }
  const result = oneBack[b.length] ?? 0;
  return result > max ? max + 1 : result;
}
