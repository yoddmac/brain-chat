'use client';

import { DELIMITED_PREVIEW_ROWS, delimiterFor, parseDelimited } from './workspace-paths';
import { useLocale } from '../i18n/locale';
import { useEffect, useRef, useState } from 'react';

/** En dessous, l'en-tête devient illisible et la colonne impossible à rattraper. */
const MIN_COLUMN_WIDTH_PX = 56;

type Drag = { index: number; startX: number; startWidth: number };

/**
 * Rendu tabulaire d'un CSV/TSV, à colonnes élargissables.
 *
 * Les largeurs se règlent en deux temps : table en `auto` au premier rendu pour que le
 * navigateur calcule les largeurs naturelles, mesure, puis passage en `fixed` où un `width`
 * explicite est enfin respecté. Elles ne sont volontairement pas mémorisées.
 */
export function WorkspaceDelimitedTable({
  content,
  mimeType,
}: {
  content: string;
  mimeType: string;
}) {
  const { t } = useLocale();
  const { rows, truncated } = parseDelimited(content, delimiterFor(mimeType));

  const header = rows[0] ?? [];
  const body = rows.slice(1);
  const columnCount = header.length;

  const headRefs = useRef<(HTMLTableCellElement | null)[]>([]);
  const dragRef = useRef<Drag | null>(null);
  const [widths, setWidths] = useState<number[] | null>(null);

  // Mesure une seule fois par forme de table : le réglage doit survivre à une réécriture.
  useEffect(() => {
    if (columnCount === 0) {
      setWidths(null);
      return;
    }
    setWidths(
      headRefs.current
        .slice(0, columnCount)
        .map((cell) => Math.max(MIN_COLUMN_WIDTH_PX, cell?.offsetWidth ?? MIN_COLUMN_WIDTH_PX)),
    );
  }, [columnCount]);

  if (rows.length === 0) {
    return <p className="bc:text-[13px] bc:text-[#8A8FA8] bc:italic">{t('chat.workspace.emptyFile')}</p>;
  }

  const resizeTo = (clientX: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    setWidths((current) => {
      if (!current) return current;
      const next = [...current];
      next[drag.index] = Math.max(MIN_COLUMN_WIDTH_PX, drag.startWidth + (clientX - drag.startX));
      return next;
    });
  };

  return (
    <div className="bc:flex bc:flex-col bc:gap-2">
      <div className="bc:overflow-x-auto bc:rounded-md bc:border bc:border-[#E5E5E5]">
        <table
          className="bc:border-collapse bc:text-[12.5px] bc:tabular-nums"
          style={{
            // `fixed` seulement une fois les largeurs mesurées.
            tableLayout: widths ? 'fixed' : 'auto',
            width: widths ? widths.reduce((total, width) => total + width, 0) : '100%',
            minWidth: '100%',
          }}
        >
          {widths && (
            <colgroup>
              {widths.map((width, index) => (
                <col key={index} style={{ width }} />
              ))}
            </colgroup>
          )}

          <thead>
            <tr>
              {header.map((cell, index) => (
                <th
                  key={index}
                  scope="col"
                  ref={(element) => {
                    headRefs.current[index] = element;
                  }}
                  className="bc:relative bc:border-b bc:border-[#E5E5E5] bc:bg-[#FAFBFF] bc:px-2.5 bc:py-1.5 bc:text-left bc:font-semibold bc:text-[#404040]"
                >
                  <span className="bc:block bc:truncate" title={cell}>
                    {cell}
                  </span>

                  {/* Poignée au bord droit de l'en-tête. `setPointerCapture` est ce qui
                      permet de continuer à glisser au-delà de la cellule d'origine. */}
                  {widths && index < columnCount - 1 && (
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={t('chat.workspace.resizeColumn', {
                        column: cell || String(index + 1),
                      })}
                      title={t('chat.workspace.resizeColumn', {
                        column: cell || String(index + 1),
                      })}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        dragRef.current = {
                          index,
                          startX: event.clientX,
                          // La largeur RENDUE, pas celle en mémoire : `min-width: 100%`
                          // redistribue l'espace libre, les deux valeurs diffèrent.
                          startWidth: headRefs.current[index]?.offsetWidth ?? widths[index],
                        };
                      }}
                      onPointerMove={(event) => {
                        if (dragRef.current) resizeTo(event.clientX);
                      }}
                      onPointerUp={(event) => {
                        event.currentTarget.releasePointerCapture(event.pointerId);
                        dragRef.current = null;
                      }}
                      onLostPointerCapture={() => {
                        dragRef.current = null;
                      }}
                      // Double-clic : on repart d'un rendu `auto`, seul état où la largeur
                      // naturelle est observable.
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        setWidths(null);
                      }}
                      className="bc:absolute bc:top-0 bc:-right-[3px] bc:z-10 bc:flex bc:h-full bc:w-[7px] bc:cursor-col-resize bc:touch-none bc:items-center bc:justify-center bc:select-none"
                    >
                      <span className="bc:h-3/5 bc:w-[2px] bc:rounded-full bc:bg-transparent bc:transition-colors bc:hover:bg-[#004AEB]" />
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={rowIndex} className="bc:even:bg-[#FAFAFA]">
                {header.map((_, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="bc:border-b bc:border-[#F0F0F0] bc:px-2.5 bc:py-1.5 bc:align-top bc:text-[#525252]"
                  >
                    {/* `break-words` et non `truncate` : une cellule élargie doit révéler son
                        contenu, pas rester coupée à la largeur d'origine. */}
                    <span className="bc:block bc:break-words bc:whitespace-pre-wrap">
                      {row[cellIndex] ?? ''}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bc:flex bc:flex-wrap bc:items-center bc:gap-x-3 bc:text-[11.5px] bc:text-[#8A8FA8]">
        <span>
          {t('chat.workspace.tableShape', {
            rows: String(body.length),
            columns: String(columnCount),
          })}
        </span>
        {truncated && (
          <span>
            {t('chat.workspace.rowsTruncated', { count: String(DELIMITED_PREVIEW_ROWS) })}
          </span>
        )}
      </div>
    </div>
  );
}
