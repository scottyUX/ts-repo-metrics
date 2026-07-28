function parentWithNestedArrow(xs: number[]) {
  return xs.map((x) => {
    if (x > 0) {
      if (x > 10) { return 2; }
      return 1;
    }
    return 0;
  });
}
function deepNesting(a: number, b: number) {
  if (a) {
    if (b) {
      for (let i = 0; i < a; i++) {
        if (i) { return 1; }
      }
    }
  }
  return 0;
}
