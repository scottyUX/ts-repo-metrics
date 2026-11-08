/** Name shown for a function in tables; unnamed ones get their line number so they can be told apart. */
export function functionLabel(name: string, startLine: number): string {
  return name === "(anonymous)" ? `(anonymous) · Line ${startLine}` : name;
}