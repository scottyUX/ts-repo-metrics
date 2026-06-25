export function add(a, b) {
  return a + b;
}

export function multiply(x, y) {
  if (x === 0) return 0;
  return x * y;
}

function internalHelper() {
  console.log("debug");
  return 1;
}

export { internalHelper };
