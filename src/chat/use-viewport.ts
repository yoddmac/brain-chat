'use client';

import { useEffect, useState } from 'react';

/** Paliers du design : mobile < 760, compact < 1280, desktop au-delà. */
const MOBILE_MAX = 760;
const COMPACT_MAX = 1280;

export type Viewport = 'mobile' | 'compact' | 'desktop';

/**
 * Le serveur ne connaît pas la largeur : le premier rendu suppose « desktop »,
 * puis s'ajuste au montage. Éviter cette hypothèse demanderait de ne rien rendre
 * avant l'hydratation, ce qui coûterait un écran vide à chaque chargement.
 */
export function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>('desktop');

  useEffect(() => {
    const compute = () => {
      const width = window.innerWidth;
      setViewport(width < MOBILE_MAX ? 'mobile' : width < COMPACT_MAX ? 'compact' : 'desktop');
    };

    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  return viewport;
}
