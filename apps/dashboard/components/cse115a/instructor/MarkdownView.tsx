import { Fragment, type ReactNode } from "react";
import { parseMarkdown, type Block, type FrontMatterField, type Inline } from "@/lib/cse115a/markdownView";
import { REVIEW_TEXT } from "@/lib/cse115a/reviewText";

// Draws a task spec parsed by lib/cse115a/markdownView.ts (#440). Every piece of student text is a React text node,
// so HTML in it is shown as text; nothing here sets inner HTML. Links open in a new tab and only when
// safeHref allowed them; images are never loaded.

const LINK = "text-primary underline break-words";

function SafeLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>{children}</a>;
}

function inlines(items: Inline[]): ReactNode {
  return items.map((item, index) => {
    switch (item.kind) {
      case "text": return <Fragment key={index}>{item.text}</Fragment>;
      case "code": return <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{item.text}</code>;
      case "strong": return <strong key={index}>{inlines(item.children)}</strong>;
      case "em": return <em key={index}>{inlines(item.children)}</em>;
      case "break": return <br key={index} />;
      case "link":
        return item.href ? <SafeLink key={index} href={item.href}>{inlines(item.children)}</SafeLink>
          : <span key={index}>{inlines(item.children)} ({item.address})</span>;
      case "image":
        return (
          <span key={index} className="rounded border border-dashed border-border px-1 text-muted-foreground">
            {REVIEW_TEXT.imageNotLoaded(item.alt)}{" "}
            {item.href ? <SafeLink href={item.href}>{item.address}</SafeLink> : <span className="break-all">{item.address}</span>}
          </span>
        );
    }
  });
}

const HEADING_CLASS: Record<number, string> = {
  1: "text-lg font-semibold", 2: "text-base font-semibold", 3: "text-sm font-semibold",
  4: "text-sm font-semibold", 5: "text-sm font-medium", 6: "text-sm font-medium text-muted-foreground",
};

function blocks(items: Block[]): ReactNode {
  return items.map((block, index) => {
    switch (block.kind) {
      case "heading": {
        const Tag = `h${Math.min(block.level + 2, 6)}` as "h3" | "h4" | "h5" | "h6";
        return <Tag key={index} className={`${HEADING_CLASS[block.level]} mt-4 first:mt-0`}>{inlines(block.children)}</Tag>;
      }
      case "paragraph": return <p key={index} className="mt-2 first:mt-0">{inlines(block.children)}</p>;
      case "code":
        return <pre key={index} className="mt-2 overflow-auto rounded-md bg-muted p-2 font-mono text-xs first:mt-0"><code>{block.text}</code></pre>;
      case "rule": return <hr key={index} className="my-3 border-border" />;
      case "quote": return <blockquote key={index} className="mt-2 border-l-2 border-border pl-3 text-muted-foreground first:mt-0">{blocks(block.children)}</blockquote>;
      case "list": {
        const items = block.items.map((item, itemIndex) => <li key={itemIndex} className="mt-1 [&>p]:mt-0">{blocks(item)}</li>);
        return block.ordered
          ? <ol key={index} start={block.start === 1 ? undefined : block.start} className="mt-2 list-decimal pl-6 first:mt-0">{items}</ol>
          : <ul key={index} className="mt-2 list-disc pl-6 first:mt-0">{items}</ul>;
      }
      case "table":
        return (
          <div key={index} className="mt-2 overflow-x-auto first:mt-0">
            <table className="border-collapse text-left text-sm">
              <thead><tr>{block.head.map((cell, column) => <th key={column} style={{ textAlign: block.align[column] ?? undefined }} className="border border-border bg-muted px-2 py-1 font-semibold">{inlines(cell)}</th>)}</tr></thead>
              <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, column) => <td key={column} style={{ textAlign: block.align[column] ?? undefined }} className="border border-border px-2 py-1 align-top">{inlines(cell)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
    }
  });
}

function FrontMatter({ fields }: { fields: FrontMatterField[] }) {
  return (
    <dl className="mb-3 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5 rounded-md bg-muted/60 p-2 text-xs">
      {fields.map((field, index) => (
        <Fragment key={index}>
          <dt className="font-mono text-muted-foreground">{field.key}</dt>
          <dd className="break-words">{field.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** A task spec drawn as formatted text: its front matter as a small list, then the markdown. */
export function MarkdownView({ markdown }: { markdown: string }) {
  const parsed = parseMarkdown(markdown);
  return (
    <div className="text-sm leading-relaxed">
      {parsed.frontMatter && parsed.frontMatter.length ? <FrontMatter fields={parsed.frontMatter} /> : null}
      {blocks(parsed.blocks)}
    </div>
  );
}
