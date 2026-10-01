'use client';

import { useLocale } from '../i18n/locale';
import ReactMarkdown, { Components } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

const schema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'br',
    'strong',
    'em',
    'ul',
    'ol',
    'li',
    'p',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ],
};

const rehypePlugins = [rehypeRaw, [rehypeSanitize, schema]] as any;
const remarkPlugins = [remarkGfm];

export function SafeMarkdownContent({
  content,
  components,
  emptyText,
}: {
  content: string;
  components?: Components;
  emptyText?: string;
}) {
  const { t } = useLocale();
  if (!content) return <p className="bc:text-sm bc:text-slate-300 bc:italic">{emptyText ?? t('markdown.emptyContent')}</p>;
  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
}
