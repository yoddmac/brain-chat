'use client';

import {
  SPLIT_HANDLE_WIDTH_PX,
  SPLIT_MAX_PERCENT,
  SPLIT_MIN_PERCENT,
  clampSplit,
} from './useSplitSize';
import { useCallback, useState, type RefObject } from 'react';

/** Pas du réglage au clavier. Assez petit pour ajuster, assez grand pour ne pas s'épuiser. */
const KEYBOARD_STEP = 2;

type Props = {
  /** Conteneur des deux panneaux : c'est sa géométrie qui donne l'origine du calcul. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Largeur du panneau de DROITE, en pourcentage. */
  percent: number;
  onChange: (percent: number) => void;
  onReset: () => void;
  label: string;
};

/**
 * Séparateur déplaçable entre la conversation et l'éditeur. `setPointerCapture` est ce qui
 * rend le glissement fiable : sans lui, passer au-dessus du `textarea` ou d'une zone
 * défilable détourne les événements et la poignée décroche.
 */
export function SplitHandle({ containerRef, percent, onChange, onReset, label }: Props) {
  const [dragging, setDragging] = useState(false);

  const percentFromClientX = useCallback(
    (clientX: number): number => {
      const rect = containerRef.current?.getBoundingClientRect();
      // La poignée est retirée de la largeur de référence, comme dans le layout.
      const usable = (rect?.width ?? 0) - SPLIT_HANDLE_WIDTH_PX;
      if (!rect || usable <= 0) return percent;
      // Le panneau de droite va du curseur au bord droit du conteneur.
      return clampSplit(((rect.right - clientX) / usable) * 100);
    },
    [containerRef, percent],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Flèche gauche : le séparateur va à gauche, donc l'éditeur grandit.
    if (event.key === 'ArrowLeft') onChange(percent + KEYBOARD_STEP);
    else if (event.key === 'ArrowRight') onChange(percent - KEYBOARD_STEP);
    else if (event.key === 'Home') onChange(SPLIT_MAX_PERCENT);
    else if (event.key === 'End') onChange(SPLIT_MIN_PERCENT);
    else return;

    event.preventDefault();
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(percent)}
      aria-valuemin={SPLIT_MIN_PERCENT}
      aria-valuemax={SPLIT_MAX_PERCENT}
      tabIndex={0}
      title={label}
      onKeyDown={handleKeyDown}
      onDoubleClick={onReset}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (!dragging) return;
        onChange(percentFromClientX(event.clientX));
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId);
        setDragging(false);
      }}
      onLostPointerCapture={() => setDragging(false)}
      style={{ width: SPLIT_HANDLE_WIDTH_PX }}
      className={`bc:group bc:relative bc:z-10 bc:flex bc:flex-none bc:cursor-col-resize bc:touch-none bc:items-center bc:justify-center bc:bg-[#F5F6FF] bc:transition-colors bc:select-none bc:hover:bg-[#DDE4FF] bc:focus-visible:bg-[#DDE4FF] bc:focus-visible:outline-none ${
        dragging ? 'bc:bg-[#DDE4FF]' : ''
      }`}
    >
      {/* Trait fin toujours visible, poignée plus marquée au survol : le séparateur doit se
          lire comme une bordure au repos, comme un contrôle quand on l'approche. */}
      <span
        className={`bc:h-8 bc:w-[3px] bc:rounded-full bc:transition-colors ${
          dragging ? 'bc:bg-[#004AEB]' : 'bc:bg-[#C3CBDC] bc:group-hover:bg-[#004AEB]'
        }`}
      />
    </div>
  );
}
