'use client';

import { WorkspaceFileBody } from './WorkspaceFileBody';
import { formatWorkspaceSize, workspaceBasename, workspaceRelativePath } from './workspace-paths';
import { useLocale } from '../i18n/locale';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { downloadTextFile } from '../download';
import type { WorkspaceFileContentUio } from '@breign/client';
import { Download, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chemin demandé, connu avant que le contenu n'arrive : sert de titre pendant le chargement. */
  path: string | null;
  file: WorkspaceFileContentUio | null;
  loading: boolean;
  /** Le fichier a disparu entre le listing et la lecture — cas normal, l'agent l'a supprimé. */
  missing: boolean;
  error: boolean;
  /** Absent ⇒ lecture seule (le lecteur ne décide pas des droits). */
  onDelete?: (path: string) => Promise<void> | void;
};

/**
 * Lecteur d'un fichier du workspace, en boîte de dialogue : le seul conteneur qui se
 * comporte à l'identique dans le chat pleine page, le widget et l'avatar.
 */
export function WorkspaceFileReader({
  open,
  onOpenChange,
  path,
  file,
  loading,
  missing,
  error,
  onDelete,
}: Props) {
  const { t, locale } = useLocale();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // La confirmation ne doit pas survivre à la fermeture ni au changement de fichier.
  useEffect(() => {
    setConfirmingDelete(false);
  }, [path, open]);

  const displayPath = path ?? '';
  const updatedAt = file
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(file.updatedAt),
      )
    : null;

  const handleDelete = async () => {
    if (!onDelete || !path) return;
    setDeleting(true);
    try {
      await onDelete(path);
      onOpenChange(false);
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bc:flex bc:max-h-[85vh] bc:flex-col bc:gap-0 bc:overflow-hidden bc:p-0 bc:sm:max-w-[880px]">
        <DialogHeader className="bc:border-b bc:border-[#E5E5E5] bc:px-5 bc:py-4 bc:pr-14 bc:text-left">
          <DialogTitle className="bc:truncate bc:text-[15px] bc:font-semibold">
            {workspaceBasename(displayPath) || t('chat.workspace.title')}
          </DialogTitle>
          <DialogDescription className="bc:flex bc:flex-wrap bc:items-center bc:gap-x-2 bc:gap-y-0.5 bc:text-[11.5px] bc:text-[#8A8FA8]">
            <span className="bc:font-mono">{workspaceRelativePath(displayPath)}</span>
            {file && (
              <>
                <span>· {formatWorkspaceSize(file.size, locale)}</span>
                <span>· v{file.version}</span>
                <span>· {t('chat.workspace.updatedAt', { date: updatedAt as string })}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="bc:min-h-0 bc:flex-1 bc:overflow-y-auto bc:px-5 bc:py-4">
          {loading && <p className="bc:text-[13px] bc:text-[#8A8FA8]">{t('common.loading')}</p>}
          {!loading && missing && (
            <p className="bc:text-[13px] bc:text-[#92400E]">{t('chat.workspace.missing')}</p>
          )}
          {!loading && !missing && error && (
            <p className="bc:text-[13px] bc:text-[#B91C1C]">{t('chat.workspace.readFailed')}</p>
          )}
          {!loading && !missing && !error && file && (
            <WorkspaceFileBody content={file.content} mimeType={file.mimeType} />
          )}
        </div>

        {file && (
          <div className="bc:flex bc:flex-wrap bc:items-center bc:justify-between bc:gap-2 bc:border-t bc:border-[#E5E5E5] bc:bg-[#FAFBFF] bc:px-5 bc:py-3">
            <button
              type="button"
              onClick={() =>
                downloadTextFile(workspaceBasename(file.path), file.content, file.mimeType)
              }
              className="bc:flex bc:cursor-pointer bc:items-center bc:gap-1.5 bc:rounded-[7px] bc:border bc:border-[#E5E5E5] bc:bg-white bc:px-2.5 bc:py-1 bc:text-[12px] bc:text-[#404040] bc:hover:border-[#004AEB] bc:hover:text-[#004AEB]"
            >
              <Download className="bc:h-3.5 bc:w-3.5" />
              {t('chat.workspace.download')}
            </button>

            {onDelete && !confirmingDelete && (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="bc:flex bc:cursor-pointer bc:items-center bc:gap-1.5 bc:rounded-[7px] bc:border bc:border-[#E5E5E5] bc:bg-white bc:px-2.5 bc:py-1 bc:text-[12px] bc:text-[#525252] bc:hover:border-[#DC2626] bc:hover:text-[#DC2626]"
              >
                <Trash2 className="bc:h-3.5 bc:w-3.5" />
                {t('common.delete')}
              </button>
            )}

            {onDelete && confirmingDelete && (
              <div className="bc:flex bc:items-center bc:gap-1.5">
                <span className="bc:text-[11.5px] bc:text-[#92400E]">
                  {t('chat.workspace.deleteConfirm')}
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="bc:cursor-pointer bc:rounded-[7px] bc:border bc:border-[#E5E5E5] bc:bg-white bc:px-2.5 bc:py-1 bc:text-[12px] bc:text-[#525252]"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="bc:cursor-pointer bc:rounded-[7px] bc:bg-[#DC2626] bc:px-2.5 bc:py-1 bc:text-[12px] bc:font-medium bc:text-white bc:disabled:opacity-50"
                >
                  {t('common.confirm')}
                </button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
