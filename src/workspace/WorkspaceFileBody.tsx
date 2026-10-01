'use client';

import { WorkspaceDelimitedTable } from './WorkspaceDelimitedTable';
import { workspaceRenderKind } from './workspace-paths';
import { useLocale } from '../i18n/locale';
import { SafeMarkdownContent } from '../markdown/SafeMarkdownContent';

function JsonBody({ content }: { content: string }) {
  // Un JSON invalide reste un fichier texte lisible : on retombe sur le brut.
  let pretty = content;
  try {
    pretty = JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    /* contenu brut */
  }
  return (
    <pre className="bc:m-0 bc:font-mono bc:text-[12.5px] bc:leading-relaxed bc:whitespace-pre-wrap bc:text-[#262626]">
      {pretty}
    </pre>
  );
}

/**
 * Rendu en lecture d'un fichier du workspace, choisi sur le `mimeType`. Partagé entre le
 * lecteur et la vue artefact.
 */
export function WorkspaceFileBody({ content, mimeType }: { content: string; mimeType: string }) {
  const { t } = useLocale();

  if (!content) {
    return <p className="bc:text-[13px] bc:text-[#8A8FA8] bc:italic">{t('chat.workspace.emptyFile')}</p>;
  }

  switch (workspaceRenderKind(mimeType)) {
    case 'markdown':
      return (
        <div className="bc:prose bc:prose-sm bc:prose-neutral bc:max-w-none bc:[&_p]:leading-relaxed">
          <SafeMarkdownContent content={content} />
        </div>
      );
    case 'delimited':
      return <WorkspaceDelimitedTable content={content} mimeType={mimeType} />;
    case 'json':
      return <JsonBody content={content} />;
    default:
      return (
        <pre className="bc:m-0 bc:font-mono bc:text-[12.5px] bc:leading-relaxed bc:whitespace-pre-wrap bc:text-[#262626]">
          {content}
        </pre>
      );
  }
}
