'use client';

import { WorkspaceFileBody } from './WorkspaceFileBody';
import {
  formatWorkspaceSize,
  workspaceBasename,
  workspaceRelativePath,
  workspaceRenderKind,
} from './workspace-paths';
import { useLocale } from '../i18n/locale';
import { downloadTextFile } from '../download';
import type { WorkspaceFileContentUio } from '@breign/client';
import { Download, Eye, PenLine, Trash2, Undo2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Ce que l'artefact montre à l'ouverture. Un CSV brut est illisible, donc un tableau
 * délimité s'ouvre rendu ; le reste s'ouvre dans l'éditeur.
 */
function previewOnOpen(mimeType: string): boolean {
  return workspaceRenderKind(mimeType) === 'delimited';
}

export type WorkspaceArtifactProps = {
  path: string;
  /** Version courante du fichier d'après le listing. Un changement déclenche une relecture. */
  storeVersion?: number;
  read: (path: string) => Promise<WorkspaceFileContentUio | null>;
  save: (
    path: string,
    content: string,
    expectedVersion: number,
  ) => Promise<
    | { status: 'saved'; file: WorkspaceFileContentUio }
    | { status: 'conflict'; currentVersion: number | null }
    | { status: 'gone' }
    | { status: 'error'; message: string }
  >;
  remove?: (path: string) => Promise<void>;
  onSaved?: () => void;
  onClose: () => void;
};

/**
 * Vue artefact : le fichier ouvert à côté de la conversation, et modifiable sur place. Pas
 * de mode lecture puis édition — la zone de texte est la vue par défaut, le rendu est un
 * aperçu qu'on demande. L'enregistrement reste explicite : chaque sauvegarde consomme la
 * version lue, un enregistrement automatique produirait une rafale de conflits.
 *
 * Relecture automatique : brouillon intact ⇒ une nouvelle version du store est reprise ;
 * brouillon modifié ⇒ jamais, la divergence est annoncée et l'utilisateur tranche.
 */
export function WorkspaceArtifact({
  path,
  storeVersion,
  read,
  save,
  remove,
  onSaved,
  onClose,
}: WorkspaceArtifactProps) {
  const { t, locale } = useLocale();

  const [file, setFile] = useState<WorkspaceFileContentUio | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);

  /** Le contenu en cours de frappe. Source de vérité de ce que l'utilisateur voit. */
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  /**
   * Refus de la dernière sauvegarde. Un conflit se résout en réenregistrant sur la version
   * courante, un fichier disparu ne se résout pas — d'où les deux cas distincts.
   */
  const [refusal, setRefusal] = useState<
    { kind: 'conflict'; currentVersion: number } | { kind: 'gone' } | null
  >(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);

  // Jeton de requête : c'est le dernier fichier demandé qui doit s'afficher, pas le dernier
  // arrivé.
  const requestRef = useRef(0);
  /** Fichier pour lequel le défaut d'affichage a déjà été posé — voir plus bas. */
  const previewDefaultedFor = useRef<string | null>(null);

  const dirty = file !== null && draft !== file.content;
  const renderable = file !== null && workspaceRenderKind(file.mimeType) !== 'text';

  const load = useCallback(async () => {
    const token = requestRef.current + 1;
    requestRef.current = token;

    setLoading(true);
    setMissing(false);
    setFailed(false);

    try {
      const content = await read(path);
      if (requestRef.current !== token) return;
      if (content) {
        setFile(content);
        setDraft(content.content);
        setRefusal(null);

        // Le type n'est connu qu'après lecture, donc le défaut se pose ici — une seule fois
        // par fichier, sinon une relecture ramènerait l'utilisateur à l'aperçu.
        if (previewDefaultedFor.current !== path) {
          previewDefaultedFor.current = path;
          setPreview(previewOnOpen(content.mimeType));
        }
      } else {
        setMissing(true);
      }
    } catch {
      if (requestRef.current === token) setFailed(true);
    } finally {
      if (requestRef.current === token) setLoading(false);
    }
  }, [path, read]);

  // Ouverture, et changement de fichier : tout repart de zéro.
  useEffect(() => {
    setSaveError(false);
    setConfirmingDelete(false);
    setConfirmingClose(false);
    void load();
  }, [load]);

  // `dirty` est lu dans la condition et non déclaré en dépendance : la relecture ne doit
  // partir que quand le store bouge.
  useEffect(() => {
    if (storeVersion === undefined) return;
    if (file === null || storeVersion === file.version) return;
    if (dirty) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeVersion]);

  const handleSave = useCallback(async () => {
    if (!file || saving) return;

    setSaving(true);
    setSaveError(false);

    try {
      // Après un conflit, on envoie la version courante du serveur : sinon le second
      // enregistrement serait refusé pour la même raison.
      const expectedVersion = refusal?.kind === 'conflict' ? refusal.currentVersion : file.version;
      const result = await save(path, draft, expectedVersion);

      if (result.status === 'saved') {
        setFile(result.file);
        setDraft(result.file.content);
        setRefusal(null);
        onSaved?.();
        return;
      }

      if (result.status === 'conflict') {
        // Un 409 sans version courante signifie que la ligne a disparu, pas qu'elle a bougé.
        setRefusal(
          result.currentVersion === null
            ? { kind: 'gone' }
            : { kind: 'conflict', currentVersion: result.currentVersion },
        );
        return;
      }

      if (result.status === 'gone') {
        setRefusal({ kind: 'gone' });
        return;
      }

      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }, [draft, file, onSaved, path, refusal, save, saving]);

  /**
   * Ctrl/⌘+S, au niveau document : un handler React ne reçoit l'événement que si quelque
   * chose à l'intérieur a le focus, ce qui exclut l'aperçu.
   */
  useEffect(() => {
    if (!dirty) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      void handleSave();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dirty, handleSave]);

  /** Annule la frappe en cours sans toucher au serveur. */
  const revert = () => {
    if (!file) return;
    setDraft(file.content);
    setRefusal(null);
    setSaveError(false);
  };

  const requestClose = () => {
    // Fermer en perdant silencieusement une frappe non enregistrée serait inacceptable.
    if (dirty) {
      setConfirmingClose(true);
      return;
    }
    onClose();
  };

  const handleDelete = async () => {
    if (!remove) return;
    await remove(path);
    onClose();
  };

  const updatedAt = file
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(file.updatedAt),
      )
    : null;

  return (
    // Aucune largeur ici : c'est le parent qui porte le partage, réglable par l'utilisateur.
    <aside className="bc:flex bc:h-full bc:w-full bc:min-w-0 bc:flex-col bc:bg-white">
      <header className="bc:flex bc:items-start bc:gap-2 bc:border-b bc:border-[#E5E5E5] bc:bg-[#FAFBFF] bc:px-4 bc:py-3">
        <div className="bc:min-w-0 bc:flex-1">
          <div className="bc:truncate bc:text-[14px] bc:font-semibold bc:text-[#171717]">
            {workspaceBasename(path)}
          </div>
          <div className="bc:flex bc:flex-wrap bc:items-center bc:gap-x-2 bc:text-[11px] bc:text-[#8A8FA8]">
            <span className="bc:font-mono">{workspaceRelativePath(path)}</span>
            {file && (
              <>
                <span>· {formatWorkspaceSize(file.size, locale)}</span>
                <span>· v{file.version}</span>
                <span>· {t('chat.workspace.updatedAt', { date: updatedAt as string })}</span>
              </>
            )}
            {dirty && (
              <span className="bc:font-medium bc:text-[#92400E]">· {t('chat.workspace.unsaved')}</span>
            )}
          </div>
        </div>

        {renderable && (
          <button
            type="button"
            onClick={() => setPreview((value) => !value)}
            title={preview ? t('chat.workspace.backToEditor') : t('chat.workspace.preview')}
            className="bc:flex bc:shrink-0 bc:cursor-pointer bc:items-center bc:gap-1.5 bc:rounded-[7px] bc:border bc:border-[#E5E5E5] bc:bg-white bc:px-2 bc:py-1 bc:text-[11.5px] bc:text-[#525252] bc:hover:border-[#004AEB] bc:hover:text-[#004AEB]"
          >
            {preview ? <PenLine className="bc:h-3.5 bc:w-3.5" /> : <Eye className="bc:h-3.5 bc:w-3.5" />}
            {preview ? t('chat.workspace.backToEditor') : t('chat.workspace.preview')}
          </button>
        )}

        <button
          type="button"
          onClick={requestClose}
          aria-label={t('common.close')}
          title={t('common.close')}
          className="bc:shrink-0 bc:cursor-pointer bc:rounded-lg bc:p-1 bc:text-[#525252] bc:hover:bg-[#ECEEFF]"
        >
          <X className="bc:h-4 bc:w-4" />
        </button>
      </header>

      {confirmingClose && (
        <div className="bc:flex bc:flex-wrap bc:items-center bc:gap-2 bc:border-b bc:border-[#FDE68A] bc:bg-[#FFFBEB] bc:px-4 bc:py-2.5">
          <p className="bc:m-0 bc:min-w-0 bc:flex-1 bc:text-[12px] bc:text-[#92400E]">
            {t('chat.workspace.closeUnsaved')}
          </p>
          <button
            type="button"
            onClick={() => setConfirmingClose(false)}
            className="bc:shrink-0 bc:cursor-pointer bc:rounded-[7px] bc:border bc:border-[#E5E5E5] bc:bg-white bc:px-2.5 bc:py-1 bc:text-[11.5px] bc:text-[#525252]"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="bc:shrink-0 bc:cursor-pointer bc:rounded-[7px] bc:border bc:border-[#D97706] bc:bg-white bc:px-2.5 bc:py-1 bc:text-[11.5px] bc:font-medium bc:text-[#92400E]"
          >
            {t('chat.workspace.closeAnyway')}
          </button>
        </div>
      )}

      {/* Un fichier disparu n'a pas de « recharger » à proposer : il reste le téléchargement,
          seule issue qui préserve le texte. */}
      {refusal !== null && (
        <div className="bc:flex bc:flex-wrap bc:items-center bc:gap-2 bc:border-b bc:border-[#FDE68A] bc:bg-[#FFFBEB] bc:px-4 bc:py-2.5">
          <p className="bc:m-0 bc:min-w-0 bc:flex-1 bc:text-[12px] bc:text-[#92400E]">
            {refusal.kind === 'conflict'
              ? t('chat.workspace.conflict', { version: String(refusal.currentVersion) })
              : t('chat.workspace.conflictGone')}
          </p>
          {refusal.kind === 'conflict' && (
            <button
              type="button"
              onClick={() => void load()}
              className="bc:shrink-0 bc:cursor-pointer bc:rounded-[7px] bc:border bc:border-[#D97706] bc:bg-white bc:px-2.5 bc:py-1 bc:text-[11.5px] bc:font-medium bc:text-[#92400E]"
            >
              {t('chat.workspace.discardAndReload')}
            </button>
          )}
        </div>
      )}

      {saveError && (
        <p className="bc:m-0 bc:border-b bc:border-[#FECACA] bc:bg-[#FEF2F2] bc:px-4 bc:py-2.5 bc:text-[12px] bc:text-[#B91C1C]">
          {t('chat.workspace.saveFailed')}
        </p>
      )}

      {/* En aperçu c'est le conteneur qui défile, en édition la zone de texte : sinon deux
          barres de défilement imbriquées. */}
      <div className={`bc:min-h-0 bc:flex-1 ${preview ? 'bc:overflow-y-auto' : 'bc:overflow-hidden'}`}>
        {loading && <p className="bc:px-4 bc:py-4 bc:text-[13px] bc:text-[#8A8FA8]">{t('common.loading')}</p>}

        {!loading && missing && (
          <p className="bc:px-4 bc:py-4 bc:text-[13px] bc:text-[#92400E]">{t('chat.workspace.missing')}</p>
        )}

        {!loading && !missing && failed && (
          <p className="bc:px-4 bc:py-4 bc:text-[13px] bc:text-[#B91C1C]">{t('chat.workspace.readFailed')}</p>
        )}

        {/* L'aperçu rend le brouillon, pas le fichier enregistré. */}
        {!loading && !missing && !failed && file && preview && (
          <div className="bc:px-4 bc:py-4">
            <WorkspaceFileBody content={draft} mimeType={file.mimeType} />
          </div>
        )}

        {!loading && !missing && !failed && file && !preview && (
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
            aria-label={workspaceBasename(path)}
            className="bc:h-full bc:w-full bc:resize-none bc:border-0 bc:px-4 bc:py-4 bc:font-mono bc:text-[12.5px] bc:leading-relaxed bc:text-[#262626] bc:focus:outline-none"
          />
        )}
      </div>

      {file && !missing && (
        <div className="bc:flex bc:flex-wrap bc:items-center bc:justify-between bc:gap-2 bc:border-t bc:border-[#E5E5E5] bc:bg-[#FAFBFF] bc:px-4 bc:py-2.5">
          <div className="bc:flex bc:items-center bc:gap-1.5">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !dirty}
              title="Ctrl/⌘+S"
              className="bc:cursor-pointer bc:rounded-[7px] bc:bg-[#004AEB] bc:px-2.5 bc:py-1 bc:text-[12px] bc:font-medium bc:text-white bc:disabled:cursor-default bc:disabled:opacity-40"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>

            {dirty && (
              <button
                type="button"
                onClick={revert}
                className="bc:flex bc:cursor-pointer bc:items-center bc:gap-1.5 bc:rounded-[7px] bc:border bc:border-[#E5E5E5] bc:bg-white bc:px-2.5 bc:py-1 bc:text-[12px] bc:text-[#525252] bc:hover:border-[#004AEB] bc:hover:text-[#004AEB]"
              >
                <Undo2 className="bc:h-3.5 bc:w-3.5" />
                {t('chat.workspace.revert')}
              </button>
            )}

            <button
              type="button"
              onClick={() => downloadTextFile(workspaceBasename(path), draft, file.mimeType)}
              className="bc:flex bc:cursor-pointer bc:items-center bc:gap-1.5 bc:rounded-[7px] bc:border bc:border-[#E5E5E5] bc:bg-white bc:px-2.5 bc:py-1 bc:text-[12px] bc:text-[#404040] bc:hover:border-[#004AEB] bc:hover:text-[#004AEB]"
            >
              <Download className="bc:h-3.5 bc:w-3.5" />
              {t('chat.workspace.download')}
            </button>
          </div>

          {remove && !confirmingDelete && (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="bc:flex bc:cursor-pointer bc:items-center bc:gap-1.5 bc:rounded-[7px] bc:border bc:border-[#E5E5E5] bc:bg-white bc:px-2.5 bc:py-1 bc:text-[12px] bc:text-[#525252] bc:hover:border-[#DC2626] bc:hover:text-[#DC2626]"
            >
              <Trash2 className="bc:h-3.5 bc:w-3.5" />
              {t('common.delete')}
            </button>
          )}

          {remove && confirmingDelete && (
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
                className="bc:cursor-pointer bc:rounded-[7px] bc:bg-[#DC2626] bc:px-2.5 bc:py-1 bc:text-[12px] bc:font-medium bc:text-white"
              >
                {t('common.confirm')}
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
