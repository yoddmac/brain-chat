/**
 * Traduction côté client de la convention de chemins de brain-api
 * (`src/shared/workspace/workspace-path.ts`). L'API renvoie tout le workspace : le tri
 * livrables / plan de travail se déduit du chemin.
 */

export const WORKSPACE_ROOT = '/home/user';

/** Ce que l'agent a délibérément rendu lisible. Le reste est son plan de travail. */
export const WORKSPACE_OUT_ROOT = `${WORKSPACE_ROOT}/out`;

export function workspaceBasename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Chemin relatif au workspace — `out/rapport.md` plutôt que `/home/user/out/rapport.md`. */
export function workspaceRelativePath(path: string): string {
  return path.startsWith(`${WORKSPACE_ROOT}/`) ? path.slice(WORKSPACE_ROOT.length + 1) : path;
}

/** Convention `out/` : un fichier que l'agent a désigné comme destiné à l'utilisateur. */
export function isPublishedWorkspacePath(path: string): boolean {
  return path.startsWith(`${WORKSPACE_OUT_ROOT}/`);
}

/** Sépare les livrables du plan de travail. Les deux listes sont conservées. */
export function splitWorkspaceFiles<T extends { path: string }>(
  entries: T[],
): { published: T[]; working: T[] } {
  const published: T[] = [];
  const working: T[] = [];
  for (const entry of entries) {
    (isPublishedWorkspacePath(entry.path) ? published : working).push(entry);
  }
  return { published, working };
}

/** Taille lisible via Intl : les unités sont traduites par la plateforme, pas par une clé i18n. */
export function formatWorkspaceSize(bytes: number, locale: string): string {
  const [value, unit] =
    bytes < 1024
      ? [bytes, 'byte' as const]
      : bytes < 1024 * 1024
        ? [bytes / 1024, 'kilobyte' as const]
        : [bytes / (1024 * 1024), 'megabyte' as const];

  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    // `short` et non `narrow` : ce dernier colle l'unité au chiffre (« 0o », « 12o »).
    unitDisplay: 'short',
    maximumFractionDigits: unit === 'byte' ? 0 : 1,
  }).format(value);
}

export type WorkspaceRenderKind = 'markdown' | 'delimited' | 'json' | 'text';

/** Choisit le rendu du lecteur. Le `mimeType` fait foi : il est normalisé côté serveur. */
export function workspaceRenderKind(mimeType: string): WorkspaceRenderKind {
  if (mimeType === 'text/markdown') return 'markdown';
  if (mimeType === 'text/csv' || mimeType === 'text/tab-separated-values') return 'delimited';
  if (mimeType === 'application/json') return 'json';
  return 'text';
}

/** Nombre de lignes de données affichées par le lecteur, en-tête exclu. */
export const DELIMITED_PREVIEW_ROWS = 500;

/**
 * Analyse CSV/TSV de prévisualisation : guillemets, guillemet doublé, séparateur ou saut de
 * ligne dans un champ, CRLF. Tolérante — un fichier mal formé s'affiche de travers plutôt
 * que de faire échouer le lecteur — et bornée à `maxRows`.
 */
export function parseDelimited(
  content: string,
  delimiter: string,
  maxRows: number = DELIMITED_PREVIEW_ROWS + 1,
): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];

    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (content[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = false;
      }
      continue;
    }

    if (char === '"' && field === '') {
      quoted = true;
    } else if (char === delimiter) {
      endField();
    } else if (char === '\n') {
      endRow();
      if (rows.length >= maxRows) return { rows, truncated: i < content.length - 1 };
    } else if (char !== '\r') {
      field += char;
    }
  }

  // Dernière ligne sans saut final : `field`/`row` portent encore des données.
  if (field !== '' || row.length > 0) endRow();

  return { rows, truncated: false };
}

export function delimiterFor(mimeType: string): string {
  return mimeType === 'text/tab-separated-values' ? '\t' : ',';
}
