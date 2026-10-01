import { WORKSPACE_ROOT } from '../workspace/workspace-paths';

/**
 * Cible réellement navigable d'un lien écrit par le modèle, sinon `null`. Les fichiers du
 * workspace n'ont pas d'URL : un lien vers eux mène à une impasse, alors qu'ils s'ouvrent
 * par la carte affichée sous le message.
 */
export function navigableMarkdownHref(href: string | undefined): string | null {
  const target = href?.trim();
  if (!target || target === '#') return null;
  if (target.startsWith(WORKSPACE_ROOT) || /^(?:sandbox|file):/i.test(target)) return null;
  return target;
}
