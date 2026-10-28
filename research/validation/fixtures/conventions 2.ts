function h1_else(n: number) {
  if (n === 1) { return 1; } else { return 2; }
}
function h2_emptyCaseFallthrough(s: string) {
  switch (s) {
    case "a":
    case "b":
    case "c":
      return 1;
    default:
      return 0;
  }
}
function h3_switchBreaks(s: string) {
  let r = 0;
  switch (s) {
    case "a": r = 1; break;
    case "b": r = 2; break;
    case "c": r = 3; break;
  }
  return r;
}
function h4_logicalOps(a: boolean, b: boolean, c: boolean) {
  if (a && b && c) { return 1; }
  return 0;
}
function h5_nestedFn(xs: number[]) {
  return xs.map(function inner(x) {
    if (x > 0) { return 1; }
    return 0;
  });
}
function h6_plain(a: number, b: number) {
  const total = a + b;
  const label = "result";
  return { total, label };
}
