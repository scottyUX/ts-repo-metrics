/**
 * Text-processing utilities shared across modules.
 */

/**
 * Count the number of newline-delimited lines in a string.
 *
 * @param text - Raw file contents.
 * @returns Line count (empty file = 0, single trailing newline not double-counted).
 */
export function countLines(text: string): number {
  if (text.length === 0) return 0;
  let count = 1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") count++;
  }
  if (text[text.length - 1] === "\n") count--;
  return count;
}
