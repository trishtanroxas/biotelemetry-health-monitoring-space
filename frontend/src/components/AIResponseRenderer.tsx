import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AIResponseRendererProps {
  content: string;
  className?: string;
}

export const AIResponseRenderer: React.FC<AIResponseRendererProps> = ({ content, className = '' }) => {
  return (
    <div className={`markdown-body font-sans text-xs ${className}`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ node, ...props }) => (
            <div className="table-responsive-wrapper my-2.5 overflow-x-auto rounded-lg border border-slate-700/80 bg-[#061220]/90">
              <table {...props} className="w-full border-collapse text-left text-xs" />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th {...props} className="border-b border-slate-700/80 bg-[#0a1e35] px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-cyan-300" />
          ),
          td: ({ node, ...props }) => (
            <td {...props} className="border-b border-slate-800/80 px-3 py-2 text-slate-200 text-xs" />
          ),
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline underline-offset-2 hover:text-cyan-300" />
          ),
          code: ({ node, className, children, ...props }) => {
            const isInline = !props.style && typeof children === 'string' && !children.includes('\n');
            return isInline ? (
              <code {...props} className="rounded bg-slate-900/90 border border-cyan-500/30 px-1.5 py-0.5 font-mono text-[11px] text-cyan-300">
                {children}
              </code>
            ) : (
              <code {...props} className="font-mono text-xs text-slate-200">
                {children}
              </code>
            );
          },
          pre: ({ node, ...props }) => (
            <pre {...props} className="my-2.5 overflow-x-auto rounded-lg border border-slate-800 bg-[#050d18] p-3 text-xs leading-relaxed" />
          ),
          h1: ({ node, ...props }) => (
            <h1 {...props} className="mb-2 mt-3 text-sm font-bold text-cyan-400" />
          ),
          h2: ({ node, ...props }) => (
            <h2 {...props} className="mb-1.5 mt-2.5 text-xs font-bold uppercase tracking-wide text-cyan-300" />
          ),
          h3: ({ node, ...props }) => (
            <h3 {...props} className="mb-1 mt-2 text-xs font-semibold text-slate-200" />
          ),
          ul: ({ node, ...props }) => (
            <ul {...props} className="my-1.5 list-disc space-y-1 pl-4 text-slate-300" />
          ),
          ol: ({ node, ...props }) => (
            <ol {...props} className="my-1.5 list-decimal space-y-1 pl-4 text-slate-300" />
          ),
          li: ({ node, ...props }) => (
            <li {...props} className="leading-relaxed" />
          ),
          p: ({ node, ...props }) => (
            <p {...props} className="mb-2 last:mb-0 leading-relaxed text-slate-200" />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote {...props} className="my-2 border-l-2 border-cyan-500/60 bg-[#06182c]/40 py-1.5 pl-3 pr-2 italic text-slate-300" />
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
};
