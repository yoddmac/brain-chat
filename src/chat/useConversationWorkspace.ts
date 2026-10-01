'use client';

import { useChatApi } from '../api-context';
import type { WorkspaceListing } from '../client';
import type { WorkspaceFileEntryUio } from '@breign/client';
import { useCallback, useMemo } from 'react';
import useSWR from 'swr';

const EMPTY_LISTING: WorkspaceListing = { files: [], fileCount: 0, totalBytes: 0 };

export type ConversationWorkspace = {
  listing: WorkspaceListing;
  /** Index par chemin : le fil n'a que des chemins, il lui faut version et taille. */
  byPath: Map<string, WorkspaceFileEntryUio>;
  isLoading: boolean;
  /** Relit le listing et le rend : l'appelant décide quoi faire d'un workspace resté vide. */
  refresh: () => Promise<WorkspaceListing>;
  remove: (path: string) => Promise<void>;
};

/**
 * Le workspace de la conversation, partagé entre le fil et le panneau : la clé SWR ne dépend
 * que de la conversation, donc une seule requête pour les deux. Pas de rafraîchissement
 * automatique — l'appelant sait quand un tour se termine.
 */
export function useConversationWorkspace(conversationId: string | null): ConversationWorkspace {
  const api = useChatApi();
  const key = conversationId ? (['conversation-workspace', conversationId] as const) : null;

  const { data, isLoading, mutate } = useSWR(key, () =>
    api.listWorkspaceFiles(conversationId as string),
  );

  const listing = data ?? EMPTY_LISTING;

  const byPath = useMemo(
    () => new Map(listing.files.map((file) => [file.path, file])),
    [listing.files],
  );

  const refresh = useCallback(async () => (await mutate()) ?? EMPTY_LISTING, [mutate]);

  const remove = useCallback(
    async (path: string) => {
      if (!conversationId) return;
      await api.deleteWorkspaceFile(conversationId, path);
      // Revalidation obligatoire : le fil affiche encore le fichier supprimé.
      await mutate();
    },
    [api, conversationId, mutate],
  );

  return { listing, byPath, isLoading, refresh, remove };
}
