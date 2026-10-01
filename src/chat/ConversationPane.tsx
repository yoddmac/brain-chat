'use client';

import { useChatApi } from '../api-context';
import { describeChatError } from './api-error';
import type { ChatFeatures } from '../types';
import { ContextWindowGauge } from './ContextWindowGauge';
import { agentColor, initials } from './agent-visuals';
import { useConversationWorkspace } from './useConversationWorkspace';
import { useWorkspaceFileReader } from './useWorkspaceFileReader';
import {
  ApprovalCard,
  approvalResourceOf,
  approvalToolOf,
  toApprovalRequest,
  type ApprovalDecision,
  type ApprovalRequest,
} from '../approvals/ApprovalCard';
import { ApprovalTrace, optimisticApproval } from '../approvals/ApprovalTrace';
import { useLocale } from '../i18n/locale';
import { SafeMarkdownContent } from '../markdown/SafeMarkdownContent';
import { navigableMarkdownHref } from '../markdown/navigable-href';
import { WorkspaceFileCard } from '../workspace/WorkspaceFileCard';
import { WorkspaceFileReader } from '../workspace/WorkspaceFileReader';
import { isPublishedWorkspacePath } from '../workspace/workspace-paths';
import {
  ConversationMessageApprovalUio,
  type ConversationContextUsageUio,
  type WorkspaceFileEntryUio,
} from '@breign/client';
import { ArrowDown, Info, Paperclip, ScanText, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { Components } from 'react-markdown';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type ChatMessage = {
  id: string;
  role: 'user' | 'agent';
  text: string;
  at: string;
  /** Horodatage brut : `at` est déjà formaté en HH:MM, donc incomparable à une date. */
  atIso: string;
  tools: string[];
  /**
   * Chemins du workspace touchés pendant le tour qui a produit ce message. L'API ne
   * distingue pas écrit de supprimé : le croisement avec le listing courant s'en charge.
   */
  workspaceFiles?: string[];
  pending?: boolean;
  /** Autorisation attendue par le bac à sable : le tour reste suspendu tant qu'elle est là. */
  approval?: ApprovalRequest | null;
  /** Décisions déjà prises sur ce message, telles que l'historique les porte. */
  approvals?: ConversationMessageApprovalUio[];
  /** Identifiant serveur du message, seul répondable : `id` peut être un id local optimiste. */
  serverId?: string;
};

type AttachedFile = {
  id: string;
  name: string;
};

type AgentCommand = {
  name: string;
  description?: string;
};

type Props = {
  agentId: string;
  agentName: string;
  userLabel: string;
  lang: string;
  /** Non-lus à l'ouverture : fige la position du séparateur pour la session. */
  unreadCount: number;
  orgId: string;
  /** Conversation en cours avec cet agent, telle que mémorisée côté serveur. */
  initialConversationId: string | null;
  /** Sur mobile, l'en-tête est porté par la page : celui-ci ferait doublon. */
  hideHeader?: boolean;
  /** Sur tablette, ouvre le tiroir de détails de l'agent. */
  onShowDetails?: () => void;
  /** Remonte la conversation au parent, dont le panneau latéral est un frère. */
  onConversationChange?: (conversationId: string | null) => void;
  /** Remonte l'occupation de la fenêtre : l'en-tête mobile est rendu par le parent. */
  onContextUsageChange?: (usage: ConversationContextUsageUio | null) => void;
  /** Ouvre le fichier dans la vue artefact du parent. Fourni ⇒ le dialogue n'est pas monté. */
  onOpenArtifact?: (path: string) => void;
  /** Ref mise à jour sans re-render, pour l'en-tête mobile. */
  clearConversationRef?: MutableRefObject<(() => void) | null>;
  features: ChatFeatures;
  ocrAvailable?: boolean;
};

const POLL_INTERVAL_MS = 900;
// Marge en pixels sous laquelle on considère que l'utilisateur lit toujours le bas de la
// conversation. Sans cette tolérance, les arrondis du navigateur sur scrollHeight/scrollTop
// suffiraient à faire croire qu'il a remonté alors qu'il n'a pas bougé.
const AUTO_SCROLL_STICKY_THRESHOLD_PX = 64;
const POLL_TIMEOUT_MS = 180_000;

function formatTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Rendu des liens du fil : un lien qui ne mène nulle part n'est pas rendu comme un lien.
 * Constante de module — `react-markdown` re-rend tout l'arbre si `components` change
 * d'identité.
 */
const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children }) => {
    const target = navigableMarkdownHref(href);
    if (!target) return <span className="bc:break-all">{children}</span>;

    return (
      <a
        href={target}
        className="bc:text-[#004AEB] bc:underline bc:underline-offset-2"
        target="_blank"
        rel="noreferrer"
      >
        {children}
      </a>
    );
  },
};

/**
 * Livrables touchés pendant un tour, sous le message qui l'a produit. Seuls les chemins sous
 * `out/` ; un chemin que le listing ne connaît plus est rendu comme supprimé.
 */
function MessageWorkspaceFiles({
  paths,
  byPath,
  sinceIso,
  onOpen,
}: {
  paths: string[] | undefined;
  byPath: Map<string, WorkspaceFileEntryUio>;
  sinceIso: string;
  onOpen: (path: string) => void;
}) {
  const published = (paths ?? []).filter(isPublishedWorkspacePath);
  if (published.length === 0) return null;

  return (
    <div className="bc:mt-0.5 bc:flex bc:flex-wrap bc:gap-1.5">
      {published.map((path) => (
        <WorkspaceFileCard
          key={path}
          path={path}
          entry={byPath.get(path)}
          sinceIso={sinceIso}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

// ─── Composant ────────────────────────────────────────────────────────────────

export function ConversationPane({
  agentId,
  agentName,
  userLabel,
  lang,
  unreadCount,
  orgId,
  initialConversationId,
  hideHeader,
  onShowDetails,
  onConversationChange,
  onContextUsageChange,
  onOpenArtifact,
  clearConversationRef,
  features,
  ocrAvailable = false,
}: Props) {
  const { t, locale } = useLocale();
  const api = useChatApi();
  const approvalsEnabled = features.approvals !== false;
  const attachmentsEnabled = features.attachments !== false;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(null);
  // Vrai tant que l'utilisateur lit le bas de la conversation : c'est la seule condition qui
  // autorise le défilement automatique pendant la génération.
  const [stickToBottom, setStickToBottom] = useState(true);

  // Déstructuré : l'objet du hook est recréé à chaque rendu et ferait tourner en boucle les
  // dépendances de `pollReply`, alors que `refresh` et `remove` sont stables.
  const {
    byPath: workspaceByPath,
    refresh: refreshWorkspace,
    remove: removeWorkspaceFile,
  } = useConversationWorkspace(conversationId);
  const reader = useWorkspaceFileReader(conversationId);

  /** Arrive avec la conversation puis avec le statut de chaque tour ; aucune requête dédiée. */
  const [contextUsage, setContextUsage] = useState<ConversationContextUsageUio | null>(null);

  // L'artefact gagne quand le parent en propose un ; sinon on retombe sur le dialogue.
  const openWorkspaceFile = onOpenArtifact ?? reader.openFile;

  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [useOcr, setUseOcr] = useState(false);
  const [commands, setCommands] = useState<AgentCommand[]>([]);

  // Figé au premier rendu pour l'agent : le séparateur ne doit pas remonter à
  // mesure que la marque de lecture est posée.
  const [unreadAtOpen] = useState(unreadCount);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstUnreadRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  const color = agentColor(agentId);
  const agentInitials = initials(agentName);

  // La conversation naît ici, de deux origines (historique, premier envoi) : un seul effet.
  useEffect(() => {
    onConversationChange?.(conversationId);
  }, [conversationId, onConversationChange]);

  useEffect(() => {
    onContextUsageChange?.(contextUsage);
  }, [contextUsage, onContextUsageChange]);

  // Historique de l'agent courant : la conversation mémorisée est rechargée, et
  // oubliée si l'API ne la connaît plus.
  useEffect(() => {
    cancelledRef.current = false;
    setMessages([]);
    setConversationId(null);
    setAttachments([]);
    setContextUsage(null);
    setLoadingHistory(true);

    if (!initialConversationId) {
      setLoadingHistory(false);
      return;
    }

    void api.fetchConversation(agentId, initialConversationId)
      .then(async (conversation) => {
        if (cancelledRef.current) return;
        if (!conversation) return;
        setConversationId(conversation.id);
        setContextUsage(conversation.contextUsage ?? null);
        const history = (conversation.messages ?? [])
          .filter((m) => m.role === 'USER' || m.role === 'ASSISTANT')
          .map((m) => ({
            id: m.id,
            serverId: m.id,
            role: m.role === 'USER' ? ('user' as const) : ('agent' as const),
            text: m.content,
            at: formatTime(m.timestamp, locale),
            atIso: m.timestamp,
            tools: (m.toolResults ?? [])
              .map((entry) => entry.tool?.toolName ?? entry.tool?.tool)
              .filter(Boolean) as string[],
            workspaceFiles: m.workspaceFiles ?? [],
            // Écrites par le serveur au moment de la décision : relire la conversation suffit.
            approvals: m.approvals ?? [],
          }));
        setMessages(history);

        // Rattrapage d'un tour suspendu quitté puis rechargé : seul le dernier message de l'agent
        // peut l'être.
        const lastAgent = [...history].reverse().find((m) => m.role === 'agent');
        if (!lastAgent) return;

        try {
          const approval = toApprovalRequest(
            await api.getPendingToolCalls(conversation.id, lastAgent.id),
          );
          if (approval && !cancelledRef.current) {
            setMessages((prev) =>
              prev.map((m) => (m.id === lastAgent.id ? { ...m, approval } : m)),
            );
          }
        } catch (err) {
          console.error('Failed to read the pending tool calls of a reopened conversation', err);
        }
      })
      .catch(() => {
        // Historique indisponible : la conversation reprend à vide.
      })
      .finally(() => {
        if (!cancelledRef.current) setLoadingHistory(false);
      });

    return () => {
      cancelledRef.current = true;
    };
  }, [agentId, locale, initialConversationId]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  // Seule source de vérité du suivi : la position réelle de lecture. Dès que l'utilisateur remonte
  // au-delà du seuil, le suivi se coupe ; dès qu'il redescend en bas, il se réarme tout seul.
  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setStickToBottom(distanceFromBottom <= AUTO_SCROLL_STICKY_THRESHOLD_PX);
  }, []);

  // Le défilement est instantané pendant la génération, et c'est délibéré : une animation `smooth`
  // relancée à chaque fragment reçu se superpose à elle-même, entre en conflit avec le geste de
  // scroll de l'utilisateur et émet ses propres événements de défilement — que handleScroll lirait
  // alors comme un déplacement volontaire.
  useEffect(() => {
    if (!stickToBottom) return;
    scrollToBottom(sending ? 'auto' : 'smooth');
  }, [messages, sending, stickToBottom, scrollToBottom]);

  // Une autre conversation s'ouvre : la position de lecture de la précédente n'a plus de sens, on
  // repart collé en bas.
  useEffect(() => {
    setStickToBottom(true);
  }, [conversationId]);

  // Commandes proposées par les skills de l'agent, pour le menu « / ».
  useEffect(() => {
    let cancelled = false;
    void api.getAgentCommands(agentId)
      .then((available) => {
        if (cancelled) return;
        setCommands(
          (available ?? []).map((command) => ({
            name: command.slug,
            description: command.description || undefined,
          })),
        );
      })
      .catch(() => setCommands([]));
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  /** Conversation courante, créée à la volée si l'envoi n'a pas encore eu lieu. */
  const ensureConversation = useCallback(async () => {
    if (conversationId) return conversationId;
    const { id } = await api.createConversation(agentId, lang);
    await api.setAgentConversation(orgId, agentId, id);
    setConversationId(id);
    return id;
  }, [conversationId, agentId, lang, orgId]);

  /**
   * Envoi en trois temps, comme le reste de l'application : demande d'une cible
   * présignée, dépôt du fichier, puis marquage comme téléversé.
   */
  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const convId = await ensureConversation();
        const ext = file.name.includes('.') ? (file.name.split('.').pop() ?? '') : '';
        const isImage = file.type.startsWith('image/');

        const request = await api.requestAttachment({
          conversationId: convId,
          fileDescription: {
            type: isImage ? 'image' : 'file',
            name: file.name,
            mimeType: file.type,
            ext,
            size: file.size,
            // Le service de parsing ignore l'OCR sur les formats qui portent
            // déjà du vrai texte : ne le demander que pour un PDF.
            ocr: ocrAvailable && useOcr && ext.toLowerCase() === 'pdf',
          },
        });

        if (!('postURL' in request)) {
          throw new Error(t('chat.conversation.uploadFailed'));
        }

        const formData = new FormData();
        for (const key in request.formData) formData.append(key, request.formData[key]);
        if (!formData.has('content-type') && !formData.has('Content-Type')) {
          formData.append('content-type', request.mimeType);
        }
        formData.append('file', file);

        const response = await fetch(request.postURL, { method: 'POST', body: formData });
        if (!response.ok) throw new Error(t('chat.conversation.uploadFailed'));

        await api.markAttachmentUploaded(convId, request.id);

        setAttachments((prev) => [...prev, { id: request.id, name: file.name }]);
      } catch (error) {
        toast.error(describeChatError(error, t, 'chat.conversation.uploadFailed'));
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [ensureConversation, t, useOcr],
  );

  /**
   * Interroge le statut jusqu'à ce que la réponse soit complète, en erreur, ou expirée.
   * `waiting_client` sort de la boucle sans erreur : le tour attend une décision de l'utilisateur.
   */
  /**
   * Rattache au message les chemins du workspace touchés pendant son tour. `MessageStatusUio`
   * ne les porte pas, d'où la relecture du message ; le listing sert de garde, un workspace
   * vide signifiant que l'agent n'a pas de bac à sable.
   */
  const attachWorkspaceFiles = useCallback(
    async (convId: string, messageId: string, localId: string) => {
      try {
        const listing = await refreshWorkspace();
        if (listing.files.length === 0) return;

        const message = await api.getMessageContent(convId, messageId);
        const paths = message.workspaceFiles ?? [];
        if (paths.length === 0) return;

        setMessages((prev) =>
          prev.map((m) => (m.id === localId ? { ...m, workspaceFiles: paths } : m)),
        );
      } catch (err) {
        // Les cartes sont un supplément : leur absence ne doit pas faire échouer le tour.
        console.error('Failed to attach workspace files to a message', err);
      }
    },
    [refreshWorkspace],
  );

  const pollReply = useCallback(
    async (convId: string, messageId: string, placeholderId: string) => {
      const startedAt = Date.now();

      while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
        if (cancelledRef.current) return;
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        if (cancelledRef.current) return;

        const status = await api.getMessageStatus(convId, messageId);

        if (status.status === 'completed') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === placeholderId
                ? {
                    ...m,
                    text: status.content ?? '',
                    tools: (status.toolsUsed ?? [])
                      .map((tool) => tool.name)
                      .filter(Boolean) as string[],
                    pending: false,
                  }
                : m,
            ),
          );
          void attachWorkspaceFiles(convId, messageId, placeholderId);
          // Le tour vient d'être mesuré côté serveur : la jauge suit dans le même sondage.
          if (status.contextUsage) setContextUsage(status.contextUsage);
          return;
        }

        if (status.status === 'waiting_client') {
          let approval: ApprovalRequest | null = null;
          try {
            approval = toApprovalRequest(await api.getPendingToolCalls(convId, messageId));
          } catch (err) {
            console.error('Failed to read the pending tool calls of a suspended turn', err);
          }

          // `waiting_client` ne dit pas « une décision est attendue », il dit « le serveur n'a pas
          // encore écrit autre chose ». Sans carte à afficher il n'y a donc rien à arrêter : la
          // reprise est en vol et n'a pas encore réécrit le statut, un autre onglet vient de
          // répondre, ou la lecture ci-dessus a échoué. Dans les trois cas on continue à suivre —
          // s'arrêter ici figerait le message jusqu'au rechargement.
          if (!approval) continue;

          setMessages((prev) =>
            prev.map((m) =>
              m.id === placeholderId
                ? {
                    ...m,
                    serverId: messageId,
                    text: status.content ?? m.text,
                    pending: false,
                    approval,
                  }
                : m,
            ),
          );
          return;
        }

        if (
          status.status === 'error' ||
          status.status === 'failed' ||
          status.status === 'moderated'
        ) {
          throw new Error(status.error?.message ?? t('chat.conversation.replyFailed'));
        }
      }

      throw new Error(t('chat.conversation.replyTimeout'));
    },
    [attachWorkspaceFiles, t],
  );

  /**
   * Le POST résout l'appel d'outil, ce qui relance côté serveur le tour suspendu — il n'y a plus
   * qu'à le suivre.
   */
  const decideApproval = useCallback(
    async (message: ChatMessage, decision: ApprovalDecision) => {
      const messageId = message.serverId;
      // Sans id serveur il n'y a rien à quoi répondre. Dit à l'écran : sinon le clic ne produit
      // rien du tout, et la carte reste là comme si l'utilisateur n'avait pas décidé.
      if (!conversationId || !messageId) {
        toast.error(t('bubble.approval.submitFailed'));
        return;
      }

      try {
        await api.submitToolCallResult(conversationId, messageId, decision.callId, {
          status: decision.approved ? 'completed' : 'refused',
          ...(decision.approved
            ? { approvalScope: decision.scope, approvalWidth: decision.width }
            : {}),
        });
      } catch (error) {
        toast.error(describeChatError(error, t, 'bubble.approval.submitFailed'));
        return;
      }

      // Le tour de reprise tourne déjà côté serveur. La carte cède la place à sa trace : le serveur
      // écrit la sienne dans la foulée, celle-ci évite juste que le clic ne laisse rien à l'écran.
      const request = message.approval;
      const decided = request
        ? optimisticApproval({
            tool: approvalToolOf(request),
            granted: decision.approved,
            resource: approvalResourceOf(request, decision),
            scope: decision.scope,
            // Pas de nom : le serveur enregistre `name || email`, et le libellé dérivé de
            // l'e-mail dont dispose ce volet changerait au rechargement.
          })
        : undefined;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id
            ? {
                ...m,
                approval: null,
                pending: true,
                approvals: decided ? [...(m.approvals ?? []), decided] : m.approvals,
              }
            : m,
        ),
      );

      try {
        await pollReply(conversationId, messageId, message.id);
      } catch (error) {
        setMessages((prev) =>
          prev.map((m) => (m.id === message.id ? { ...m, pending: false } : m)),
        );
        toast.error(describeChatError(error, t, 'chat.conversation.replyFailed'));
      }
    },
    [conversationId, pollReply, t],
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const now = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: `local-user-${Date.now()}`,
      role: 'user',
      text,
      at: formatTime(now, locale),
      atIso: now,
      tools: [],
    };
    const placeholderId = `local-agent-${Date.now()}`;

    // Poser une nouvelle question vaut retour en bas : on veut voir sa propre question partir,
    // même si on relisait plus haut juste avant.
    setStickToBottom(true);
    setMessages((prev) => [
      ...prev,
      userMessage,
      {
        id: placeholderId,
        role: 'agent',
        text: '',
        at: formatTime(now, locale),
        atIso: now,
        tools: [],
        pending: true,
      },
    ]);
    setInput('');
    setSending(true);

    try {
      const result = await api.sendMessage({
        agentId,
        conversationId: conversationId ?? undefined,
        message: text,
        lang,
      });

      const convId = result.data.conversationId;
      if (convId && convId !== conversationId) {
        setConversationId(convId);
        void api.setAgentConversation(orgId, agentId, convId);
      }

      if (!convId || !result.data.messageId) {
        throw new Error(t('chat.conversation.replyFailed'));
      }

      await pollReply(convId, result.data.messageId, placeholderId);
    } catch (error) {
      // Le message en attente est retiré : mieux vaut aucune réponse qu'une vide.
      setMessages((prev) => prev.filter((m) => m.id !== placeholderId));
      toast.error(describeChatError(error, t, 'chat.conversation.replyFailed'));
    } finally {
      setSending(false);
    }
  }, [input, sending, locale, agentId, conversationId, lang, pollReply, t, orgId]);

  /** « Vider la conversation » : une nouvelle conversation remplace la précédente. */
  const clearConversation = useCallback(async () => {
    try {
      const { id } = await api.createConversation(agentId, lang);
      await api.setAgentConversation(orgId, agentId, id);
      setConversationId(id);
      setMessages([]);
      // La conversation qui remplace n'a aucun tour mesuré : garder la jauge de la précédente
      // afficherait une occupation qui n'est plus celle de personne.
      setContextUsage(null);
      toast.success(t('chat.conversation.cleared'));
    } catch (error) {
      toast.error(describeChatError(error, t, 'chat.conversation.clearFailed'));
    }
  }, [agentId, lang, t, orgId]);

  if (clearConversationRef) {
    clearConversationRef.current = clearConversation;
  }

  const commandQuery = input.startsWith('/') ? input.slice(1).split(' ')[0].toLowerCase() : null;
  const matchingCommands =
    commandQuery === null
      ? []
      : commands.filter((command) => command.name.toLowerCase().startsWith(commandQuery));
  const showCommands = commandQuery !== null && !input.includes(' ') && matchingCommands.length > 0;

  return (
    <>
      <header
        hidden={hideHeader}
        className="bc:relative bc:z-20 bc:flex bc:items-center bc:justify-between bc:gap-2 bc:border-b bc:border-[#E5E5E5] bc:bg-[#FAFBFF] bc:px-4 bc:py-3 bc:xl:px-7 bc:xl:py-4"
      >
        <div className="bc:flex bc:min-w-0 bc:items-center bc:gap-[11px]">
          <span
            className="bc:flex bc:h-[34px] bc:w-[34px] bc:shrink-0 bc:items-center bc:justify-center bc:rounded-[10px] bc:text-[13px] bc:font-semibold bc:text-white"
            style={{ background: color }}
          >
            {agentInitials}
          </span>
          <div className="bc:min-w-0">
            <div className="bc:truncate bc:text-[15px] bc:font-semibold">{agentName}</div>
            <div className="bc:truncate bc:text-[11.5px] bc:text-[#737373]">
              {t('chat.conversation.subtitle', { count: String(messages.length) })}
            </div>
          </div>
        </div>
        <div className="bc:flex bc:shrink-0 bc:items-center bc:gap-1.5">
          <ContextWindowGauge usage={contextUsage} />
          {onShowDetails ? (
            <button
              type="button"
              onClick={onShowDetails}
              title={t('chat.panel.showDetails')}
              aria-label={t('chat.panel.showDetails')}
              className="bc:flex bc:h-9 bc:w-9 bc:items-center bc:justify-center bc:rounded-lg bc:border bc:border-[#E5E5E5] bc:bg-white bc:text-[#525252] bc:hover:bg-[#ECEEFF] bc:xl:hidden"
            >
              <Info className="bc:h-3.5 bc:w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={clearConversation}
            title={t('chat.conversation.clear')}
            aria-label={t('chat.conversation.clear')}
            className="bc:flex bc:h-9 bc:w-9 bc:items-center bc:justify-center bc:gap-1.5 bc:rounded-lg bc:border bc:border-[#E5E5E5] bc:bg-white bc:text-[#404040] bc:hover:border-[#DC2626] bc:hover:text-[#DC2626] bc:lg:h-auto bc:lg:w-auto bc:lg:px-3 bc:lg:py-[7px]"
          >
            <Trash2 className="bc:h-3.5 bc:w-3.5" />
            <span className="bc:hidden bc:text-[12.5px] bc:lg:inline">{t('chat.conversation.clear')}</span>
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="bc:relative bc:flex-1 bc:overflow-y-auto bc:px-4 bc:py-5 bc:md:px-7 bc:md:py-[26px]"
      >
        <div className="bc:mx-auto bc:flex bc:max-w-[700px] bc:flex-col bc:gap-6">
          {loadingHistory ? (
            <p className="bc:text-[13px] bc:text-[#A3A3A3]">{t('chat.conversation.loading')}</p>
          ) : messages.length === 0 ? (
            <p className="bc:text-[13px] bc:text-[#A3A3A3]">
              {t('chat.conversation.empty', { name: agentName })}
            </p>
          ) : (
            messages.map((message, index) => (
              <div key={message.id} className="bc:flex bc:flex-col bc:gap-6">
                {unreadAtOpen > 0 && index === messages.length - unreadAtOpen && (
                  <div ref={firstUnreadRef} className="bc:flex bc:items-center bc:gap-3 bc:py-0.5">
                    <span className="bc:h-px bc:flex-1 bc:bg-[#004AEB]" />
                    <span className="bc:rounded-full bc:bg-[#004AEB] bc:px-2.5 bc:py-0.5 bc:text-[10px] bc:font-semibold bc:uppercase bc:tracking-[0.05em] bc:text-white">
                      {t('chat.conversation.unreadMarker')}
                    </span>
                    <span className="bc:h-px bc:flex-1 bc:bg-[#004AEB]" />
                  </div>
                )}
                <div className="bc:flex bc:gap-3.5">
                  <span
                    className="bc:flex bc:h-7 bc:w-7 bc:flex-none bc:items-center bc:justify-center bc:rounded-lg bc:text-[10.5px] bc:font-semibold bc:text-white"
                    style={{ background: message.role === 'user' ? '#A3A3A3' : color }}
                  >
                    {message.role === 'user' ? initials(userLabel) : agentInitials}
                  </span>
                  <div className="bc:flex bc:min-w-0 bc:flex-1 bc:flex-col bc:gap-[5px]">
                    <div className="bc:flex bc:items-baseline bc:gap-2">
                      <span className="bc:text-[12.5px] bc:font-semibold">
                        {message.role === 'user' ? userLabel : agentName}
                      </span>
                      <span className="bc:text-[10.5px] bc:text-[#A3A3A3]">{message.at}</span>
                    </div>

                    {message.pending ? (
                      <div className="bc:flex bc:items-center bc:gap-1.5 bc:py-1">
                        {[0, 1, 2].map((dot) => (
                          <span
                            key={dot}
                            className="bc:h-1.5 bc:w-1.5 bc:animate-bounce bc:rounded-full bc:bg-[#A3A3A3]"
                            style={{ animationDelay: `${dot * 120}ms` }}
                          />
                        ))}
                      </div>
                    ) : message.role === 'agent' ? (
                      <div className="bc:text-sm bc:leading-[1.65] bc:text-[#262626]">
                        <SafeMarkdownContent
                          content={message.text}
                          components={MARKDOWN_COMPONENTS}
                        />
                      </div>
                    ) : (
                      <div className="bc:whitespace-pre-wrap bc:text-sm bc:leading-[1.65] bc:text-[#262626]">
                        {message.text}
                      </div>
                    )}

                    {approvalsEnabled && message.approval && (
                      <ApprovalCard
                        request={message.approval}
                        onDecide={(decision) => decideApproval(message, decision)}
                      />
                    )}

                    {approvalsEnabled && message.approvals && message.approvals.length > 0 && (
                      <ApprovalTrace approvals={message.approvals} locale={locale} />
                    )}

                    <MessageWorkspaceFiles
                      paths={message.workspaceFiles}
                      byPath={workspaceByPath}
                      sinceIso={message.atIso}
                      onOpen={openWorkspaceFile}
                    />

                    {message.tools.length > 0 && (
                      <div className="bc:mt-0.5 bc:flex bc:flex-wrap bc:gap-1.5">
                        {message.tools.map((tool) => (
                          <span
                            key={tool}
                            className="bc:inline-flex bc:items-center bc:gap-1.5 bc:rounded-[5px] bc:border bc:border-[#E5E5E5] bc:bg-[#FAFAFA] bc:px-2 bc:py-0.5 bc:text-[11px] bc:text-[#525252]"
                          >
                            <span className="bc:h-1.5 bc:w-1.5 bc:rounded-full bc:bg-[#10B981]" />
                            {tool}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          {!stickToBottom && (
            <div className="bc:pointer-events-none bc:sticky bc:bottom-0 bc:flex bc:justify-center">
              <button
                type="button"
                onClick={() => {
                  setStickToBottom(true);
                  scrollToBottom();
                }}
                aria-label={t('chat.conversation.scrollToBottom')}
                className="bc:pointer-events-auto bc:inline-flex bc:items-center bc:gap-1.5 bc:rounded-full bc:border bc:border-[#E5E5E5] bc:bg-white bc:px-3.5 bc:py-[7px] bc:text-xs bc:font-medium bc:text-[#404040] bc:shadow-[0_4px_14px_rgba(0,0,0,.12)] bc:hover:border-[#004AEB] bc:hover:text-[#004AEB]"
              >
                <ArrowDown className="bc:h-3.5 bc:w-3.5" />
                {t('chat.conversation.scrollToBottom')}
              </button>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {unreadAtOpen > 0 && (
        <div className="bc:pointer-events-none bc:sticky bc:bottom-0 bc:flex bc:justify-center bc:pb-2">
          <button
            onClick={() => firstUnreadRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="bc:pointer-events-auto bc:inline-flex bc:items-center bc:gap-1.5 bc:rounded-full bc:bg-[#004AEB] bc:px-3.5 bc:py-[7px] bc:text-xs bc:font-medium bc:text-white bc:shadow-[0_4px_14px_rgba(0,74,235,.3)]"
          >
            {t('chat.conversation.jumpToUnread', { count: String(unreadAtOpen) })}
          </button>
        </div>
      )}

      <div className="bc:border-t bc:border-[#E5E5E5] bc:px-3 bc:pb-4 bc:pt-3 bc:md:px-7 bc:md:pb-5 bc:md:pt-4">
        <div className="bc:relative bc:mx-auto bc:flex bc:max-w-[700px] bc:flex-col bc:gap-2.5 bc:rounded-[14px] bc:border bc:border-[#E5E5E5] bc:px-3.5 bc:py-3 bc:shadow-[0_1px_3px_rgba(0,0,0,.05)]">
          {attachments.length > 0 && (
            <div className="bc:flex bc:flex-wrap bc:gap-1.5">
              {attachments.map((file) => (
                <span
                  key={file.id}
                  className="bc:inline-flex bc:items-center bc:gap-1.5 bc:rounded-md bc:border bc:border-[#E5E5E5] bc:bg-[#FAFAFA] bc:px-2 bc:py-1 bc:text-[11.5px] bc:text-[#525252]"
                >
                  {file.name}
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((f) => f.id !== file.id))}
                    title={t('chat.conversation.removeFile')}
                    className="bc:text-[#A3A3A3] bc:hover:text-[#DC2626]"
                  >
                    <X className="bc:h-3 bc:w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Menu des commandes, ouvert dès que la saisie commence par « / ». */}
          {showCommands && (
            <div className="bc:absolute bc:bottom-full bc:left-0 bc:mb-2 bc:max-h-56 bc:w-full bc:overflow-y-auto bc:rounded-[10px] bc:border bc:border-[#DDE1F2] bc:bg-white bc:p-1 bc:shadow-lg">
              {matchingCommands.map((command) => (
                <button
                  key={command.name}
                  onClick={() => setInput(`/${command.name} `)}
                  className="bc:flex bc:w-full bc:flex-col bc:items-start bc:gap-0.5 bc:rounded-md bc:px-2.5 bc:py-1.5 bc:text-left bc:hover:bg-[#F5F6FF]"
                >
                  <span className="bc:font-mono bc:text-[12.5px] bc:text-[#004AEB]">/{command.name}</span>
                  {command.description && (
                    <span className="bc:text-[11.5px] bc:text-[#8A8FA8]">{command.description}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder={t('chat.conversation.placeholder', { name: agentName })}
            className="bc:max-h-40 bc:min-h-[22px] bc:w-full bc:resize-none bc:border-none bc:bg-transparent bc:text-[13.5px] bc:outline-none bc:placeholder:text-[#A3A3A3]"
          />
          <div className="bc:flex bc:items-center bc:justify-between">
            <div className="bc:flex bc:gap-1.5">
              {attachmentsEnabled ? (
              <>
              <input
                ref={fileInputRef}
                type="file"
                className="bc:hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadFile(file);
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="bc:flex bc:items-center bc:gap-1.5 bc:rounded-[7px] bc:border bc:border-[#E5E5E5] bc:bg-white bc:px-2.5 bc:py-1 bc:text-[11.5px] bc:text-[#525252] bc:disabled:opacity-50"
              >
                <Paperclip className="bc:h-3 bc:w-3" />
                {uploading ? t('chat.conversation.uploading') : t('chat.conversation.file')}
              </button>
              {/* Masqué quand l'organisation n'a pas configuré d'OCR : le drapeau
                  serait sans effet côté serveur. */}
              {ocrAvailable && (
                <button
                  onClick={() => setUseOcr((value) => !value)}
                  aria-pressed={useOcr}
                  title={t('chat.conversation.ocrHint')}
                  className={`bc:flex bc:items-center bc:gap-1.5 bc:rounded-[7px] bc:border bc:px-2.5 bc:py-1 bc:text-[11.5px] ${
                    useOcr
                      ? 'bc:border-primary bc:bg-primary/10 bc:text-primary'
                      : 'bc:border-[#E5E5E5] bc:bg-white bc:text-[#525252]'
                  }`}
                >
                  <ScanText className="bc:h-3 bc:w-3" />
                  {t('chat.conversation.ocr')}
                </button>
              )}
              </>
              ) : null}
              {commands.length > 0 && (
                <button
                  onClick={() => setInput((value) => (value.startsWith('/') ? value : '/'))}
                  className="bc:rounded-[7px] bc:border bc:border-[#E5E5E5] bc:bg-white bc:px-2.5 bc:py-1 bc:font-mono bc:text-[11.5px] bc:text-[#525252]"
                >
                  {t('chat.conversation.commands')}
                </button>
              )}
            </div>
            <button
              onClick={() => void send()}
              disabled={sending || input.trim().length === 0}
              className="bc:flex bc:items-center bc:gap-1.5 bc:rounded-lg bc:bg-[#004AEB] bc:px-3.5 bc:py-1.5 bc:text-[12.5px] bc:font-medium bc:text-white bc:disabled:opacity-50"
            >
              {sending ? t('chat.conversation.sending') : t('chat.conversation.send')}
            </button>
          </div>
        </div>
      </div>

      {/* Hors du flux : le lecteur est un dialogue, il n'hérite pas du défilement du fil. */}
      {!onOpenArtifact && (
        <WorkspaceFileReader
          open={reader.open}
          onOpenChange={reader.setOpen}
          path={reader.path}
          file={reader.file}
          loading={reader.loading}
          missing={reader.missing}
          error={reader.error}
          onDelete={removeWorkspaceFile}
        />
      )}
    </>
  );
}
