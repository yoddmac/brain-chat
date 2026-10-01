'use client';

import { useConversationWorkspace } from './useConversationWorkspace';
import { useWorkspaceFileReader } from './useWorkspaceFileReader';
import { useLocale } from '../i18n/locale';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { WorkspaceFileReader } from '../workspace/WorkspaceFileReader';
import {
  formatWorkspaceSize,
  splitWorkspaceFiles,
  workspaceBasename,
  workspaceRelativePath,
} from '../workspace/workspace-paths';
import type { WorkspaceFileEntryUio } from '@breign/client';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

function FileRow({
  entry,
  onOpen,
  onDelete,
  deleting,
  confirming,
  onConfirm,
  onCancelConfirm,
}: {
  entry: WorkspaceFileEntryUio;
  onOpen: (path: string) => void;
  onDelete: (path: string) => void;
  deleting: boolean;
  confirming: boolean;
  onConfirm: (path: string) => void;
  onCancelConfirm: () => void;
}) {
  const { t, locale } = useLocale();

  return (
    <div className="bc:group bc:flex bc:items-center bc:gap-1.5 bc:rounded-md bc:px-1.5 bc:py-1 bc:hover:bg-white">
      <button
        type="button"
        onClick={() => onOpen(entry.path)}
        title={workspaceRelativePath(entry.path)}
        className="bc:flex bc:min-w-0 bc:flex-1 bc:cursor-pointer bc:flex-col bc:items-start bc:gap-0 bc:text-left bc:focus-visible:ring-2 bc:focus-visible:ring-[#004AEB]/40 bc:focus-visible:outline-none"
      >
        <span className="bc:w-full bc:truncate bc:text-[12.5px] bc:font-medium bc:text-[#404040] bc:group-hover:text-[#004AEB]">
          {workspaceBasename(entry.path)}
        </span>
        <span className="bc:text-[11px] bc:text-[#8A8FA8]">
          {formatWorkspaceSize(entry.size, locale)}
          {entry.version > 1 ? ` · v${entry.version}` : ''}
        </span>
      </button>

      {confirming ? (
        <span className="bc:flex bc:shrink-0 bc:items-center bc:gap-1">
          <button
            type="button"
            onClick={onCancelConfirm}
            className="bc:cursor-pointer bc:rounded bc:border bc:border-[#E7E9F5] bc:bg-white bc:px-1.5 bc:py-0.5 bc:text-[10.5px] bc:text-[#525252]"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => onConfirm(entry.path)}
            className="bc:cursor-pointer bc:rounded bc:bg-[#DC2626] bc:px-1.5 bc:py-0.5 bc:text-[10.5px] bc:font-medium bc:text-white bc:disabled:opacity-50"
          >
            {t('common.confirm')}
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onDelete(entry.path)}
          title={t('common.delete')}
          aria-label={t('common.delete')}
          className="bc:shrink-0 bc:cursor-pointer bc:rounded bc:p-1 bc:text-[#C3C8DC] bc:opacity-0 bc:group-hover:opacity-100 bc:hover:text-[#DC2626] bc:focus-visible:opacity-100 bc:focus-visible:ring-2 bc:focus-visible:ring-[#004AEB]/40 bc:focus-visible:outline-none"
        >
          <Trash2 className="bc:h-3.5 bc:w-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * Onglet « Fichiers » : l'état courant du workspace de l'agent. Deux listes et non un filtre
 * — `out/` est ce que l'agent a désigné comme lisible, le reste reste visible mais replié.
 */
export function WorkspaceFilesPanel({
  conversationId,
  onOpenArtifact,
}: {
  conversationId: string | null;
  /** Fourni ⇒ le fichier s'ouvre à côté de la conversation, et non en dialogue par-dessus. */
  onOpenArtifact?: (path: string) => void;
}) {
  const { t, locale } = useLocale();
  const { listing, isLoading, remove } = useConversationWorkspace(conversationId);
  const reader = useWorkspaceFileReader(conversationId);
  const openWorkspaceFile = onOpenArtifact ?? reader.openFile;

  const [workingOpen, setWorkingOpen] = useState(false);
  const [confirmingPath, setConfirmingPath] = useState<string | null>(null);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);

  const { published, working } = splitWorkspaceFiles(listing.files);

  const handleConfirm = async (path: string) => {
    setDeletingPath(path);
    try {
      await remove(path);
      setConfirmingPath(null);
    } catch {
      toast.error(t('chat.workspace.deleteFailed'));
    } finally {
      setDeletingPath(null);
    }
  };

  const rowProps = {
    onOpen: openWorkspaceFile,
    onDelete: setConfirmingPath,
    onConfirm: (path: string) => void handleConfirm(path),
    onCancelConfirm: () => setConfirmingPath(null),
  };

  if (isLoading && listing.files.length === 0) {
    return <p className="bc:text-[12.5px] bc:text-[#8A8FA8]">{t('common.loading')}</p>;
  }

  if (listing.files.length === 0) {
    return (
      <div className="bc:flex bc:flex-col bc:gap-1.5">
        <p className="bc:m-0 bc:text-[12.5px] bc:text-[#8A8FA8]">{t('chat.workspace.empty')}</p>
        <p className="bc:m-0 bc:text-[11.5px] bc:text-[#A3A8BE]">{t('chat.workspace.emptyHint')}</p>
      </div>
    );
  }

  return (
    <div className="bc:flex bc:flex-col bc:gap-3">
      {published.length > 0 ? (
        <div className="bc:flex bc:flex-col bc:gap-0.5">
          {published.map((entry) => (
            <FileRow
              key={entry.path}
              entry={entry}
              deleting={deletingPath === entry.path}
              confirming={confirmingPath === entry.path}
              {...rowProps}
            />
          ))}
        </div>
      ) : (
        <p className="bc:m-0 bc:text-[11.5px] bc:text-[#A3A8BE]">{t('chat.workspace.noneShared')}</p>
      )}

      {working.length > 0 && (
        <Collapsible open={workingOpen} onOpenChange={setWorkingOpen}>
          <CollapsibleTrigger className="bc:flex bc:w-full bc:cursor-pointer bc:items-center bc:gap-1 bc:text-[11px] bc:font-semibold bc:tracking-[0.06em] bc:text-[#8A8FA8] bc:uppercase bc:hover:text-[#525252]">
            {workingOpen ? (
              <ChevronDown className="bc:h-3 bc:w-3" />
            ) : (
              <ChevronRight className="bc:h-3 bc:w-3" />
            )}
            {t('chat.workspace.workingFiles', { count: String(working.length) })}
          </CollapsibleTrigger>
          <CollapsibleContent className="bc:mt-1 bc:flex bc:flex-col bc:gap-0.5">
            {working.map((entry) => (
              <FileRow
                key={entry.path}
                entry={entry}
                deleting={deletingPath === entry.path}
                confirming={confirmingPath === entry.path}
                {...rowProps}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Quota en pied : c'est une information de fin de liste, pas un titre de section. */}
      <p className="bc:m-0 bc:border-t bc:border-[#E7E9F5] bc:pt-2 bc:text-[11px] bc:text-[#A3A8BE]">
        {t('chat.workspace.usage', {
          count: String(listing.fileCount),
          size: formatWorkspaceSize(listing.totalBytes, locale),
        })}
      </p>

      {!onOpenArtifact && (
        <WorkspaceFileReader
          open={reader.open}
          onOpenChange={reader.setOpen}
          path={reader.path}
          file={reader.file}
          loading={reader.loading}
          missing={reader.missing}
          error={reader.error}
          onDelete={remove}
        />
      )}
    </div>
  );
}
