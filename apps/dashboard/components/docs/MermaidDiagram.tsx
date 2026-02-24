"use client";

import { useEffect, useId, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "default",
});

interface MermaidDiagramProps {
  code: string;
  className?: string;
}

export function MermaidDiagram({ code, className }: MermaidDiagramProps) {
  const id = useId().replace(/:/g, "-");
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || !code.trim()) return;

    const render = async () => {
      try {
        setError(null);
        const { svg } = await mermaid.render(`mermaid-${id}`, code);
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    render();
  }, [code, id]);

  if (error) {
    return (
      <div
        className={`rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive ${className ?? ""}`}
      >
        Diagram failed to render: {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex min-h-[120px] items-center justify-center rounded-md border bg-muted/30 p-4 [&_svg]:max-w-full [&_svg]:max-h-[400px] [&_svg]:w-auto ${className ?? ""}`}
      suppressHydrationWarning
    />
  );
}
