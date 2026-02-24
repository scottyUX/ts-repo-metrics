/**
 * Utility functions for snapshot fixture.
 */

export function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s[0]!.toUpperCase() + s.slice(1);
}

export function isEven(n: number): boolean {
  return n % 2 === 0;
}
