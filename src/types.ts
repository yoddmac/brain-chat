import type { ReactNode } from 'react';

export type ChatAgent = {
  id: string;
  name: string;
  description?: string;
  tools?: string[];
  sandboxEnabled?: boolean;
};

export type ChatFeatures = {
  /** Rail d'agents, épingles et non-lus. `false` ne garde que le premier agent. */
  multiAgent?: boolean;
  /** Fichiers du bac à sable et vue artefact. */
  workspace?: boolean;
  /** Cartes d'autorisation des outils. */
  approvals?: boolean;
  /** Pièces jointes dans le compositeur. */
  attachments?: boolean;
};

export type ChatApiConfig = {
  baseUrl: string;
  getHeaders: () => Promise<Record<string, string>> | Record<string, string>;
};

export type RenderUserMenu = (slot: { children: ReactNode }) => ReactNode;

export type BreignChatProps = {
  api: ChatApiConfig;
  organizationId: string;
  agents: ChatAgent[];
  locale?: 'fr' | 'en';
  /** Surcharge des textes, clés pointées (`chat.conversation.send`). */
  labels?: Record<string, string>;
  features?: ChatFeatures;
  userEmail?: string;
  /** Menu hôte autour de l'avatar. Absent : l'avatar reste affiché, sans navigation. */
  renderUserMenu?: RenderUserMenu;
  /** Affiche le bouton OCR sur les PDF. */
  ocrAvailable?: boolean;
};
