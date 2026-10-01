'use client';

import { useLocale } from '../i18n/locale';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownContent({ content, emptyText }: { content: string; emptyText?: string }) {
  const { t } = useLocale();
  if (!content) return <p className="bc:text-sm bc:text-slate-300 bc:italic">{emptyText ?? t('markdown.emptyContent')}</p>;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="bc:text-xl bc:font-bold bc:mt-4 bc:mb-2 bc:first:mt-0 bc:text-slate-900">{children}</h1>,
        h2: ({ children }) => <h2 className="bc:text-lg bc:font-bold bc:mt-3 bc:mb-2 bc:first:mt-0 bc:text-slate-900">{children}</h2>,
        h3: ({ children }) => <h3 className="bc:text-base bc:font-semibold bc:mt-3 bc:mb-1 bc:first:mt-0 bc:text-slate-800">{children}</h3>,
        p: ({ children }) => <p className="bc:mb-2 bc:last:mb-0 bc:leading-relaxed bc:text-sm bc:text-slate-600">{children}</p>,
        ul: ({ children }) => <ul className="bc:list-disc bc:ml-4 bc:mb-2 bc:space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="bc:list-decimal bc:ml-4 bc:mb-2 bc:space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="bc:text-sm bc:leading-relaxed bc:text-slate-600">{children}</li>,
        code: ({ children }) => <code className="bc:bg-slate-100 bc:text-slate-800 bc:px-1.5 bc:py-0.5 bc:rounded bc:text-xs bc:font-mono">{children}</code>,
        pre: ({ children }) => <pre className="bc:bg-slate-100 bc:rounded-lg bc:p-4 bc:overflow-auto bc:mb-2 bc:text-sm">{children}</pre>,
        strong: ({ children }) => <strong className="bc:font-semibold bc:text-slate-800">{children}</strong>,
        blockquote: ({ children }) => <blockquote className="bc:border-l-2 bc:border-slate-200 bc:pl-4 bc:italic bc:text-slate-500 bc:mb-2">{children}</blockquote>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
