/**
 * Renders LaTeX formulas using KaTeX. For block equations (display mode).
 */

import katex from "katex";

interface MathBlockProps {
  /** LaTeX source (e.g. "Y_i = \\beta_0 + \\beta_1 \\text{AI}_i + \\epsilon_i") */
  children: string;
  /** Display as block (centered, larger) vs inline */
  displayMode?: boolean;
}

export function MathBlock({ children, displayMode = true }: MathBlockProps) {
  try {
    const html = katex.renderToString(children, {
      displayMode,
      throwOnError: false,
      strict: false,
    });
    return (
      <div
        className="my-4 overflow-x-auto py-2"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return <code className="text-sm text-muted-foreground">{children}</code>;
  }
}
