'use client';

import { useChatApi } from '../api-context';
import type { WorkspaceFileContentUio } from '@breign/client';
import { useCallback, useRef, useState } from 'react';

export type WorkspaceFileReaderState = {
  open: boolean;
  path: string | null;
  file: WorkspaceFileContentUio | null;
  loading: boolean;
  missing: boolean;
  error: boolean;
  /** Ouvre le lecteur et relit le contenu, même pour un fichier déjà consulté. */
  openFile: (path: string) => void;
  setOpen: (open: boolean) => void;
};

/**
 * État du lecteur de fichier. Hors SWR volontairement : l'agent réécrit le contenu entre
 * deux messages, un cache servirait une version périmée.
 */
export function useWorkspaceFileReader(conversationId: string | null): WorkspaceFileReaderState {
  const api = useChatApi();
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState<string | null>(null);
  const [file, setFile] = useState<WorkspaceFileContentUio | null>(null);
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState(false);

  // Jeton de requête : c'est le dernier fichier demandé qui doit s'afficher, pas le dernier
  // arrivé.
  const requestRef = useRef(0);

  const openFile = useCallback(
    (nextPath: string) => {
      if (!conversationId) return;

      const token = requestRef.current + 1;
      requestRef.current = token;

      setPath(nextPath);
      setOpen(true);
      setFile(null);
      setMissing(false);
      setError(false);
      setLoading(true);

      void api.readWorkspaceFile(conversationId, nextPath)
        .then((content) => {
          if (requestRef.current !== token) return;
          if (content) setFile(content);
          else setMissing(true);
        })
        .catch(() => {
          if (requestRef.current !== token) return;
          setError(true);
        })
        .finally(() => {
          if (requestRef.current === token) setLoading(false);
        });
    },
    [api, conversationId],
  );

  return { open, path, file, loading, missing, error, openFile, setOpen };
}
