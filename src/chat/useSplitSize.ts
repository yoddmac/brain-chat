'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'breign.chat.artifactWidth';

/** Bornes du partage : aucun des deux panneaux ne peut disparaître. */
export const SPLIT_MIN_PERCENT = 25;
export const SPLIT_MAX_PERCENT = 75;
const SPLIT_DEFAULT_PERCENT = 50;

/**
 * Largeur de la poignée, partagée avec le layout : les deux panneaux se répartissent la
 * largeur du conteneur MOINS cette valeur, sinon leur somme déborde.
 */
export const SPLIT_HANDLE_WIDTH_PX = 7;

/** Délai avant d'écrire la préférence : un glissement produit des dizaines de valeurs. */
const PERSIST_DEBOUNCE_MS = 300;

export function clampSplit(percent: number): number {
  if (!Number.isFinite(percent)) return SPLIT_DEFAULT_PERCENT;
  return Math.min(SPLIT_MAX_PERCENT, Math.max(SPLIT_MIN_PERCENT, percent));
}

/**
 * Largeur de l'éditeur, en pourcentage de la zone partagée avec la conversation. Lue au
 * montage et non dans l'initialiseur d'état : `localStorage` n'existe pas côté serveur et
 * l'hydratation échouerait. Préférence locale au navigateur, délibérément.
 */
export function useSplitSize(): {
  percent: number;
  setPercent: (percent: number) => void;
  reset: () => void;
} {
  const [percent, setPercentState] = useState(SPLIT_DEFAULT_PERCENT);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored !== null) setPercentState(clampSplit(Number.parseFloat(stored)));
    } catch {
      // Stockage bloqué (navigation privée) : la valeur par défaut fait l'affaire.
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(Math.round(percent)));
      } catch {
        /* idem : perdre la préférence est sans conséquence */
      }
    }, PERSIST_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [percent]);

  return {
    percent,
    setPercent: (next: number) => setPercentState(clampSplit(next)),
    reset: () => setPercentState(SPLIT_DEFAULT_PERCENT),
  };
}
