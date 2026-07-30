export function JsxLogical({ a, b, c }: { a: boolean; b: boolean; c: boolean }) {
  return (
    <div>
      {a && <span>A</span>}
      {b && <span>B</span>}
      {c && <span>C</span>}
    </div>
  );
}
export function BoolLogical(a: boolean, b: boolean, c: boolean) {
  const x = a && b;
  const y = b || c;
  const z = a && c;
  return x || y || z;
}
