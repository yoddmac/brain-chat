'use client';

import {
  formatWorkspaceSize,
  workspaceBasename,
  workspaceRelativePath,
  workspaceRenderKind,
} from './workspace-paths';
import { useLocale } from '../i18n/locale';
import { FileCode, FileJson, FileSpreadsheet, FileText, FileX2 } from 'lucide-react';

/** Ce que le listing sait d'un fichier. Absent ⇒ le chemin n'existe plus dans le store. */
export type WorkspaceEntrySummary = {
  size: number;
  version: number;
  updatedAt: string;
  mimeType: string;
};

type Props = {
  path: string;
  entry?: WorkspaceEntrySummary;
  /**
   * Horodatage du message sous lequel la carte est rendue, pour le badge « modifié depuis » :
   * le workspace n'est pas versionné dans le temps, la carte montre l'état courant.
   */
  sinceIso?: string;
  onOpen: (path: string) => void;
};

function KindIcon({ mimeType, className }: { mimeType?: string; className: string }) {
  if (!mimeType) return <FileX2 className={className} />;
  switch (workspaceRenderKind(mimeType)) {
    case 'delimited':
      return <FileSpreadsheet className={className} />;
    case 'json':
      return <FileJson className={className} />;
    case 'markdown':
      return <FileText className={className} />;
    default:
      return <FileCode className={className} />;
  }
}

function changedSince(updatedAt: string, sinceIso?: string): boolean {
  if (!sinceIso) return false;
  const updated = new Date(updatedAt).getTime();
  const since = new Date(sinceIso).getTime();
  if (Number.isNaN(updated) || Number.isNaN(since)) return false;
  // Une seconde de marge : le flush de fin de tour écrit juste après le message.
  return updated - since > 1000;
}

/**
 * Carte compacte d'un fichier du workspace, pour le fil. Sans action destructive :
 * supprimer se fait depuis le panneau ou le lecteur.
 */
export function WorkspaceFileCard({ path, entry, sinceIso, onOpen }: Props) {
  const { t, locale } = useLocale();
  const name = workspaceBasename(path);

  // Chemin listé par le message mais absent du store : supprimé, ou jamais persisté
  // (binaire, quota, chemin refusé). Il n'y a rien à ouvrir.
  if (!entry) {
    return (
      <span
        className="bc:inline-flex bc:max-w-full bc:min-w-0 bc:items-center bc:gap-1.5 bc:rounded-[5px] bc:border bc:border-dashed bc:border-[#E5E5E5] bc:bg-[#FAFAFA] bc:px-2 bc:py-0.5 bc:text-[11px] bc:text-[#A3A3A3]"
        title={t('chat.workspace.goneHint')}
      >
        <FileX2 className="bc:h-3 bc:w-3 bc:shrink-0" />
        <span className="bc:truncate bc:line-through">{name}</span>
        <span className="bc:shrink-0">· {t('chat.workspace.gone')}</span>
      </span>
    );
  }

  const modified = changedSince(entry.updatedAt, sinceIso);

  return (
    <button
      type="button"
      onClick={() => onOpen(path)}
      title={workspaceRelativePath(path)}
      className="bc:inline-flex bc:max-w-full bc:min-w-0 bc:cursor-pointer bc:items-center bc:gap-1.5 bc:rounded-[5px] bc:border bc:border-[#E5E5E5] bc:bg-white bc:px-2 bc:py-0.5 bc:text-[11px] bc:text-[#525252] bc:transition-colors bc:hover:border-[#004AEB] bc:hover:text-[#004AEB] bc:focus-visible:ring-2 bc:focus-visible:ring-[#004AEB]/40 bc:focus-visible:outline-none"
    >
      <KindIcon mimeType={entry.mimeType} className="bc:h-3 bc:w-3 bc:shrink-0" />
      <span className="bc:truncate bc:font-medium">{name}</span>
      <span className="bc:shrink-0 bc:text-[#A3A3A3]">
        {formatWorkspaceSize(entry.size, locale)}
        {entry.version > 1 ? ` · v${entry.version}` : ''}
      </span>
      {modified && (
        <span
          className="bc:shrink-0 bc:rounded-[3px] bc:bg-[#FEF3C7] bc:px-1 bc:text-[10px] bc:font-medium bc:text-[#92400E]"
          title={t('chat.workspace.changedSinceHint')}
        >
          {t('chat.workspace.changedSince')}
        </span>
      )}
    </button>
  );
}
