import { isValidElement, type ComponentPropsWithoutRef, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { MermaidDiagram } from "./MermaidDiagram";

function isMermaidCode(children: ReactNode): boolean {
  const child = Array.isArray(children) ? children[0] : children;
  if (!isValidElement(child)) return false;
  const className = (child.props as { className?: string }).className;
  return typeof className === "string" && className.includes("language-mermaid");
}

/** Shared markdown renderer for notes: GitHub-flavored Markdown (tables, task
 * lists, strikethrough) plus fenced ```mermaid blocks rendered as diagrams.
 * Used by both the editor's Preview pane and the full-reading modal so every
 * surface renders notes identically. */
export function MarkdownView({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Mermaid blocks render their own <figure> container; a <pre> wrapper
        // would impose monospace/code styling on the diagram.
        pre({ children }) {
          return isMermaidCode(children) ? <>{children}</> : <pre>{children}</pre>;
        },
        code(componentProps) {
          const { className, children } = componentProps;
          const text = String(children ?? "").replace(/\n$/, "");
          if (typeof className === "string" && className.includes("language-mermaid")) {
            return <MermaidDiagram code={text} />;
          }
          // react-markdown passes a non-DOM `node` prop; strip it before spreading.
          const domProps = { ...componentProps } as ComponentPropsWithoutRef<"code"> & {
            node?: unknown;
          };
          delete domProps.node;
          return <code className={className} {...domProps}>{children}</code>;
        },
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
