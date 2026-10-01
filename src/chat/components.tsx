'use client';

import { ContextWindowGauge } from './ContextWindowGauge';
import { ConversationPane } from './ConversationPane';
import { SplitHandle } from './SplitHandle';
import { WorkspaceFilesPanel } from './WorkspaceFilesPanel';
import { useChatApi } from '../api-context';
import type { ChatFeatures, RenderUserMenu } from '../types';
import { agentColor, initials } from './agent-visuals';
import { useViewport } from './use-viewport';
import { useConversationWorkspace } from './useConversationWorkspace';
import { SPLIT_HANDLE_WIDTH_PX, useSplitSize } from './useSplitSize';
import { useLocale } from '../i18n/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { WorkspaceArtifact } from '../workspace/WorkspaceArtifact';
import { splitWorkspaceFiles } from '../workspace/workspace-paths';
import { cn } from '../cn';
import type { ConversationContextUsageUio } from '@breign/client';
import {
  ArrowLeft,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChatAgent = {
  id: string;
  name: string;
  description: string;
  tools: string[];
  /** Bac à sable activé : sans lui, aucun fichier ne peut exister. */
  sandboxEnabled: boolean;
};

/** Non-lus et activité d'un agent, rafraîchis périodiquement. */
type AgentStatus = {
  conversationId: string;
  unreadCount: number;
  isGenerating: boolean;
};

type Props = {
  orgId: string;
  /** Préférences chargées côté serveur : rail, épinglages, conversations. */
  preferences: {
    pinnedAgentIds: string[];
    railOpen: boolean;
    agentConversations: Record<string, string>;
  };
  userEmail: string;
  agents: ChatAgent[];
  features: ChatFeatures;
  renderUserMenu?: RenderUserMenu;
  ocrAvailable?: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fréquence de rafraîchissement des non-lus et de l'activité. */
const OVERVIEW_POLL_MS = 15_000;

// ─── Menu utilisateur ─────────────────────────────────────────────────────────

/**
 * Ouvert depuis l'email dans le rail déplié, et depuis l'avatar quand il est
 * replié — sans quoi le menu serait inaccessible dans cet état.
 */
function UserMenu({
  renderUserMenu,
  children,
}: {
  renderUserMenu?: RenderUserMenu;
  children: React.ReactNode;
}) {
  if (!renderUserMenu) return <>{children}</>;
  return <>{renderUserMenu({ children })}</>;
}

// ─── Rail replié ──────────────────────────────────────────────────────────────

function CollapsedRail({
  agents,
  statuses,
  selectedId,
  onSelect,
  onExpand,
  userInitials,
  renderUserMenu,
  t,
}: {
  agents: ChatAgent[];
  statuses: Record<string, AgentStatus>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onExpand: () => void;
  userInitials: string;
  renderUserMenu?: RenderUserMenu;
  t: ReturnType<typeof useLocale>['t'];
}) {
  return (
    <aside className="bc:flex bc:w-[74px] bc:flex-none bc:flex-col bc:items-center bc:gap-2.5 bc:border-r bc:border-[#E7E9F5] bc:bg-[#F5F6FF] bc:py-3.5">
      <span className="bc:text-[11px] bc:font-bold bc:text-[#004AEB]">B</span>
      <button
        onClick={onExpand}
        title={t('chat.rail.expand')}
        className="bc:flex bc:h-[26px] bc:w-[26px] bc:items-center bc:justify-center bc:rounded-md bc:text-[#8A8FA8] bc:hover:bg-[#E2E8FF] bc:hover:text-[#004AEB]"
      >
        <PanelLeftOpen className="bc:h-[15px] bc:w-[15px]" />
      </button>
      <div className="bc:my-0.5 bc:h-px bc:w-7 bc:bg-[#DDE1F2]" />

      <div className="bc:flex bc:flex-1 bc:flex-col bc:gap-2.5 bc:overflow-y-auto">
        {agents.map((agent) => (
          <button
            key={agent.id}
            onClick={() => onSelect(agent.id)}
            title={agent.name}
            className="bc:flex bc:h-11 bc:w-11 bc:items-center bc:justify-center bc:rounded-xl"
            style={{ background: selectedId === agent.id ? '#DDE4FF' : 'transparent' }}
          >
            <span className="bc:relative">
              <span
                className="bc:flex bc:h-9 bc:w-9 bc:items-center bc:justify-center bc:rounded-[10px] bc:text-xs bc:font-semibold bc:text-white"
                style={{ background: agentColor(agent.id) }}
              >
                {initials(agent.name)}
              </span>
              {(statuses[agent.id]?.unreadCount ?? 0) > 0 && (
                <span className="bc:absolute bc:-right-1.5 bc:-top-1.5 bc:flex bc:h-[18px] bc:min-w-[18px] bc:items-center bc:justify-center bc:rounded-full bc:border-2 bc:border-[#F5F6FF] bc:bg-[#004AEB] bc:px-1 bc:text-[10px] bc:font-semibold bc:text-white">
                  {statuses[agent.id].unreadCount}
                </span>
              )}
              {statuses[agent.id]?.isGenerating && (
                <span className="bc:absolute bc:-bottom-0.5 bc:-right-0.5 bc:h-3 bc:w-3 bc:rounded-full bc:border-2 bc:border-[#F5F6FF] bc:bg-[#10B981]" />
              )}
            </span>
          </button>
        ))}
      </div>

      <div className="bc:mt-auto">
        <UserMenu renderUserMenu={renderUserMenu}>
          <span
            title={t('chat.userMenu.title')}
            className="bc:flex bc:h-[30px] bc:w-[30px] bc:items-center bc:justify-center bc:rounded-full bc:bg-[#D8DCF0] bc:text-[10.5px] bc:font-semibold bc:text-[#4A4F66] bc:hover:bg-[#C7CDE8]"
          >
            {userInitials}
          </span>
        </UserMenu>
      </div>
    </aside>
  );
}

// ─── Rail déplié ──────────────────────────────────────────────────────────────

function ExpandedRail({
  agents,
  allAgents,
  statuses,
  selectedId,
  onSelect,
  onCollapse,
  onPin,
  userEmail,
  userInitials,
  renderUserMenu,
  fullWidth,
  t,
}: {
  agents: ChatAgent[];
  allAgents: ChatAgent[];
  statuses: Record<string, AgentStatus>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCollapse: () => void;
  onPin: (id: string) => void;
  userEmail: string;
  userInitials: string;
  renderUserMenu?: RenderUserMenu;
  /** Sur mobile le rail occupe tout l'écran : il fait office de liste d'agents. */
  fullWidth?: boolean;
  t: ReturnType<typeof useLocale>['t'];
}) {
  const [filter, setFilter] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? agents.filter((a) => a.name.toLowerCase().includes(q)) : agents;
  }, [agents, filter]);

  const pinnable = useMemo(
    () => allAgents.filter((a) => !agents.some((pinned) => pinned.id === a.id)),
    [allAgents, agents],
  );

  return (
    <aside
      className={
        fullWidth
          ? 'bc:flex bc:min-h-0 bc:w-full bc:flex-1 bc:flex-col bc:bg-[#F5F6FF]'
          : 'bc:flex bc:w-[314px] bc:flex-none bc:flex-col bc:border-r bc:border-[#E7E9F5] bc:bg-[#F5F6FF]'
      }
    >
      <div className="bc:flex bc:items-center bc:justify-between bc:px-4 bc:pb-2.5 bc:pt-3.5">
        <div className="bc:flex bc:items-center bc:gap-2">
          <span className="bc:text-xs bc:font-bold bc:uppercase bc:tracking-[0.06em]">Breign</span>
        </div>
        <button
          onClick={onCollapse}
          title={t('chat.rail.collapse')}
          hidden={fullWidth}
          className="bc:flex bc:h-[26px] bc:w-[26px] bc:items-center bc:justify-center bc:rounded-md bc:text-[#8A8FA8] bc:hover:bg-[#E2E8FF] bc:hover:text-[#004AEB]"
        >
          <PanelLeftClose className="bc:h-[15px] bc:w-[15px]" />
        </button>
      </div>

      <div className="bc:flex bc:items-center bc:gap-2 bc:px-4 bc:pb-2.5">
        <div className="bc:flex bc:min-w-0 bc:flex-1 bc:items-center bc:gap-2 bc:rounded-[9px] bc:border bc:border-[#DDE1F2] bc:bg-white bc:px-2.5 bc:py-[7px]">
          <Search className="bc:h-3.5 bc:w-3.5 bc:text-[#A3A3A3]" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('chat.rail.filter')}
            className="bc:w-full bc:border-none bc:bg-transparent bc:text-[12.5px] bc:outline-none bc:placeholder:text-[#A3A3A3]"
          />
        </div>
        <button
          onClick={() => setPickerOpen((open) => !open)}
          title={t('chat.rail.addAgent')}
          className="bc:flex bc:h-8 bc:w-8 bc:flex-none bc:items-center bc:justify-center bc:rounded-[9px] bc:bg-[#004AEB] bc:text-white"
        >
          <Plus className="bc:h-[15px] bc:w-[15px]" />
        </button>
      </div>

      {pickerOpen && (
        <div className="bc:mx-4 bc:mb-2 bc:max-h-52 bc:overflow-y-auto bc:rounded-[9px] bc:border bc:border-[#DDE1F2] bc:bg-white bc:p-1">
          {pinnable.length === 0 ? (
            <p className="bc:px-2 bc:py-2 bc:text-[11.5px] bc:text-[#8A8FA8]">{t('chat.rail.allPinned')}</p>
          ) : (
            pinnable.map((agent) => (
              <button
                key={agent.id}
                onClick={() => {
                  onPin(agent.id);
                  setPickerOpen(false);
                }}
                className="bc:flex bc:w-full bc:items-center bc:gap-2 bc:rounded-md bc:px-2 bc:py-1.5 bc:text-left bc:text-[12.5px] bc:hover:bg-[#F5F6FF]"
              >
                <span
                  className="bc:flex bc:h-6 bc:w-6 bc:flex-none bc:items-center bc:justify-center bc:rounded-md bc:text-[10px] bc:font-semibold bc:text-white"
                  style={{ background: agentColor(agent.id) }}
                >
                  {initials(agent.name)}
                </span>
                <span className="bc:truncate">{agent.name}</span>
              </button>
            ))
          )}
        </div>
      )}

      <nav className="bc:flex bc:flex-1 bc:flex-col bc:gap-[3px] bc:overflow-y-auto bc:px-2.5 bc:pb-3">
        {visible.length === 0 ? (
          <p className="bc:px-3 bc:py-4 bc:text-[12px] bc:text-[#8A8FA8]">{t('chat.rail.empty')}</p>
        ) : (
          visible.map((agent) => {
            const selected = selectedId === agent.id;
            return (
              <button
                key={agent.id}
                onClick={() => onSelect(agent.id)}
                className="bc:flex bc:w-full bc:items-start bc:gap-[11px] bc:rounded-r-[9px] bc:border-l-[3px] bc:px-2.5 bc:py-[11px] bc:text-left bc:hover:bg-[#E7ECFF]"
                style={{
                  borderLeftColor: selected ? '#004AEB' : 'transparent',
                  background: selected ? '#E7ECFF' : 'transparent',
                }}
              >
                <span className="bc:relative bc:flex-none">
                  <span
                    className="bc:flex bc:h-[38px] bc:w-[38px] bc:items-center bc:justify-center bc:rounded-[11px] bc:text-[13px] bc:font-semibold bc:text-white"
                    style={{ background: agentColor(agent.id) }}
                  >
                    {initials(agent.name)}
                  </span>
                  {statuses[agent.id]?.isGenerating && (
                    <span className="bc:absolute bc:-bottom-0.5 bc:-right-0.5 bc:h-3 bc:w-3 bc:rounded-full bc:border-2 bc:border-[#F5F6FF] bc:bg-[#10B981]" />
                  )}
                </span>
                <span className="bc:flex bc:min-w-0 bc:flex-1 bc:flex-col bc:gap-[3px]">
                  <span
                    className="bc:truncate bc:text-[13.5px]"
                    style={{ fontWeight: (statuses[agent.id]?.unreadCount ?? 0) > 0 ? 600 : 500 }}
                  >
                    {agent.name}
                  </span>
                  <span className="bc:flex bc:items-center bc:gap-2">
                    <span className="bc:flex-1 bc:truncate bc:text-[11.5px] bc:text-[#8A8FA8]">
                      {statuses[agent.id]?.isGenerating
                        ? t('chat.rail.replying')
                        : (statuses[agent.id]?.unreadCount ?? 0) > 0
                          ? t('chat.rail.newMessages')
                          : agent.description || t('chat.rail.noDescription')}
                    </span>
                    {(statuses[agent.id]?.unreadCount ?? 0) > 0 && (
                      <span className="bc:flex bc:h-[18px] bc:min-w-[18px] bc:items-center bc:justify-center bc:rounded-full bc:bg-[#004AEB] bc:px-1.5 bc:text-[10.5px] bc:font-semibold bc:text-white">
                        {statuses[agent.id].unreadCount}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </nav>

      <div className="bc:border-t bc:border-[#E7E9F5] bc:px-2 bc:py-2">
        <UserMenu renderUserMenu={renderUserMenu}>
          <span className="bc:flex bc:w-full bc:items-center bc:gap-2 bc:rounded-lg bc:px-2 bc:py-1.5 bc:hover:bg-[#E7ECFF]">
            <span className="bc:flex bc:h-[26px] bc:w-[26px] bc:flex-none bc:items-center bc:justify-center bc:rounded-full bc:bg-[#D8DCF0] bc:text-[10px] bc:font-semibold bc:text-[#4A4F66]">
              {userInitials}
            </span>
            <span className="bc:truncate bc:text-[11.5px] bc:text-[#6B7089]">{userEmail}</span>
          </span>
        </UserMenu>
      </div>
    </aside>
  );
}

// ─── Panneau agent ────────────────────────────────────────────────────────────

/** Contenu du panneau, partagé par la colonne, le tiroir et la feuille mobile. */
export function AgentPanelContent({
  agent,
  t,
}: {
  agent: ChatAgent;
  t: ReturnType<typeof useLocale>['t'];
}) {
  return (
    <div className="bc:flex bc:flex-col bc:gap-[18px]">
      <div className="bc:flex bc:flex-col bc:items-center bc:gap-2.5 bc:text-center">
        <span
          className="bc:flex bc:h-14 bc:w-14 bc:items-center bc:justify-center bc:rounded-2xl bc:text-lg bc:font-semibold bc:text-white"
          style={{ background: agentColor(agent.id) }}
        >
          {initials(agent.name)}
        </span>
        <div>
          <div className="bc:text-sm bc:font-semibold">{agent.name}</div>
        </div>
      </div>

      <div className="bc:flex bc:flex-col bc:gap-2">
        <div className="bc:text-[10.5px] bc:font-semibold bc:uppercase bc:tracking-[0.07em] bc:text-[#8A8FA8]">
          {t('chat.panel.description')}
        </div>
        <p className="bc:m-0 bc:text-[12.5px] bc:leading-relaxed bc:text-[#525252]">
          {agent.description || t('chat.panel.noDescription')}
        </p>
      </div>

      <div className="bc:flex bc:flex-col bc:gap-2">
        <div className="bc:text-[10.5px] bc:font-semibold bc:uppercase bc:tracking-[0.07em] bc:text-[#8A8FA8]">
          {t('chat.panel.tools')}
        </div>
        {agent.tools.length === 0 ? (
          <p className="bc:m-0 bc:text-[12.5px] bc:text-[#8A8FA8]">{t('chat.panel.noTools')}</p>
        ) : (
          <div className="bc:flex bc:flex-wrap bc:gap-1.5">
            {agent.tools.map((tool) => (
              <span
                key={tool}
                className="bc:rounded-md bc:border bc:border-[#E5E5E5] bc:bg-white bc:px-2 bc:py-[3px] bc:text-[11px] bc:text-[#404040]"
              >
                {tool}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Identité de l'agent et état de son workspace, en onglets : le panneau défile déjà, une
 * section de plus enterrerait les fichiers. Sans `conversationId` il n'y a aucun workspace
 * à lister, et l'onglet disparaît plutôt que de s'afficher vide.
 */
function AgentPanelTabs({
  agent,
  conversationId,
  onOpenArtifact,
  t,
}: {
  agent: ChatAgent;
  conversationId: string | null;
  onOpenArtifact?: (path: string) => void;
  t: ReturnType<typeof useLocale>['t'];
}) {
  // Même clé SWR que le panneau lui-même : le compteur ne coûte pas de requête de plus.
  const { listing } = useConversationWorkspace(conversationId);
  const publishedCount = splitWorkspaceFiles(listing.files).published.length;

  if (!conversationId) return <AgentPanelContent agent={agent} t={t} />;

  return (
    <Tabs defaultValue="agent" className="bc:flex bc:min-h-0 bc:flex-1 bc:flex-col bc:gap-3">
      <TabsList className="bc:h-8 bc:w-full bc:bg-[#ECEEFF] bc:p-[3px]">
        <TabsTrigger value="agent" className="bc:text-[12px]">
          {t('chat.panel.tabAgent')}
        </TabsTrigger>
        <TabsTrigger value="files" className="bc:gap-1 bc:text-[12px]">
          {t('chat.panel.tabFiles')}
          {publishedCount > 0 && (
            <span className="bc:flex bc:h-[16px] bc:min-w-[16px] bc:items-center bc:justify-center bc:rounded-full bc:bg-[#004AEB] bc:px-1 bc:text-[10px] bc:font-semibold bc:text-white">
              {publishedCount}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="agent" className="bc:min-h-0">
        <AgentPanelContent agent={agent} t={t} />
      </TabsContent>
      <TabsContent value="files" className="bc:min-h-0">
        <WorkspaceFilesPanel conversationId={conversationId} onOpenArtifact={onOpenArtifact} />
      </TabsContent>
    </Tabs>
  );
}

function AgentPanel({
  agent,
  conversationId,
  onOpenArtifact,
  onUnpin,
  onClose,
  t,
}: {
  agent: ChatAgent;
  /** Conversation courante, remontée par le fil : sans elle, pas d'onglet Fichiers. */
  conversationId: string | null;
  onOpenArtifact?: (path: string) => void;
  onUnpin: () => void;
  /** Fourni quand le panneau est un tiroir plutôt qu'une colonne. */
  onClose?: () => void;
  t: ReturnType<typeof useLocale>['t'];
}) {
  return (
    <aside className="bc:flex bc:h-full bc:w-full bc:flex-none bc:flex-col bc:gap-[18px] bc:overflow-y-auto bc:border-l bc:border-[#E5E5E5] bc:bg-[#FAFBFF] bc:p-5 bc:xl:w-[288px]">
      {onClose && (
        <button
          onClick={onClose}
          aria-label={t('chat.mobile.close')}
          className="bc:-mt-1 bc:self-end bc:rounded-lg bc:p-1 bc:text-[#525252] bc:hover:bg-[#ECEEFF]"
        >
          <X className="bc:h-4 bc:w-4" />
        </button>
      )}

      <AgentPanelTabs
        agent={agent}
        conversationId={conversationId}
        onOpenArtifact={onOpenArtifact}
        t={t}
      />

      <button
        onClick={onUnpin}
        className="bc:mt-auto bc:rounded-[9px] bc:border bc:border-[#E5E5E5] bc:bg-white bc:p-2.5 bc:text-[12.5px] bc:text-[#737373] bc:hover:border-[#FCA5A5] bc:hover:text-[#DC2626]"
      >
        {t('chat.panel.unpin')}
      </button>
    </aside>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function MultiAgentChat({
  orgId,
  userEmail,
  agents,
  preferences,
  features,
  renderUserMenu,
  ocrAvailable,
}: Props) {
  const { t, locale } = useLocale();
  const api = useChatApi();
  const multiAgent = features.multiAgent !== false;
  const workspaceEnabled = features.workspace !== false;

  // Les préférences viennent du serveur ; l'état local n'est qu'un miroir
  // optimiste, l'écriture partant en arrière-plan.
  const [railOpen, setRailOpenState] = useState(preferences.railOpen);
  const [pinnedIds, setPinnedIdsState] = useState<string[]>(preferences.pinnedAgentIds);

  const setRailOpen = useCallback(
    (open: boolean) => {
      setRailOpenState(open);
      void api.updateChatPreferences(orgId, { railOpen: open });
    },
    [api, orgId],
  );

  const setPinnedIds = useCallback(
    (ids: string[]) => {
      setPinnedIdsState(ids);
      void api.updateChatPreferences(orgId, { pinnedAgentIds: ids });
    },
    [api, orgId],
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    multiAgent ? null : (agents[0]?.id ?? null),
  );
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({});

  const viewport = useViewport();
  const isMobile = viewport === 'mobile';
  const isCompact = viewport === 'compact';
  // Sur mobile la liste est un écran à part entière, la conversation un second.
  const [mobileShowsConversation, setMobileShowsConversation] = useState(!multiAgent);
  // En compact le panneau agent devient un tiroir, ouvert depuis l'en-tête.
  const [panelOpen, setPanelOpen] = useState(false);
  /**
   * Conversation courante, remontée par le fil, dont le panneau est un frère. Le fil renvoie
   * `null` quand on change d'agent, donc rien à réinitialiser ici.
   */
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  /** Fichier ouvert en vue artefact : une région du layout, d'où l'état porté ici. */
  const [artifactPath, setArtifactPath] = useState<string | null>(null);

  /**
   * Conversation dont le workspace est à lister, `null` pour un agent sans bac à sable. Lu
   * dans `agents` et non dans `selected`, calculé plus bas.
   */
  const workspaceConversationId =
    workspaceEnabled && agents.find((agent) => agent.id === selectedId)?.sandboxEnabled === true
      ? activeConversationId
      : null;

  // Même clé SWR que le panneau et le fil : la version courante, qui déclenche la relecture
  // de l'artefact, ne coûte pas de requête de plus.
  const {
    byPath: workspaceByPath,
    refresh: refreshWorkspace,
    remove: removeWorkspaceFile,
  } = useConversationWorkspace(workspaceConversationId);

  // Partage conversation / éditeur, réglable et mémorisé par navigateur.
  const splitRef = useRef<HTMLDivElement>(null);
  const {
    percent: artifactPercent,
    setPercent: setArtifactPercent,
    reset: resetArtifactPercent,
  } = useSplitSize();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [compactRailOpen, setCompactRailOpen] = useState(false);
  const clearConversationRef = useRef<(() => void) | null>(null);

  const pinned = useMemo(
    () => pinnedIds.map((id) => agents.find((a) => a.id === id)).filter(Boolean) as ChatAgent[],
    [pinnedIds, agents],
  );

  // La sélection suit la liste épinglée : elle ne doit jamais pointer un agent absent.
  useEffect(() => {
    if (pinned.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) =>
      current && pinned.some((a) => a.id === current) ? current : pinned[0].id,
    );
  }, [pinned]);

  // Non-lus et activité : sondés régulièrement, seule source de ces informations.
  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const overview = await api.fetchAgentChatOverview(orgId);
      if (cancelled) return;
      setStatuses(
        Object.fromEntries(
          overview.map((entry) => [
            entry.agentId,
            {
              conversationId: entry.conversationId,
              unreadCount: entry.unreadCount,
              isGenerating: entry.isGenerating,
            },
          ]),
        ),
      );
    };

    void refresh();
    const timer = setInterval(() => void refresh(), OVERVIEW_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [orgId]);

  // La préférence d'ouverture ne vaut que sur desktop : en compact la place
  // manque, le rail reste en icônes tant que l'utilisateur ne le déplie pas.
  // Changer de conversation change de workspace : l'artefact ne suit pas.
  useEffect(() => {
    setArtifactPath(null);
  }, [activeConversationId]);

  // Réservé au large : en compact il n'y a pas la place pour deux colonnes, ces surfaces
  // gardent le dialogue. Le rail est replié de force le temps de l'ouverture, sans toucher à
  // la préférence enregistrée.
  const canUseArtifact = !isCompact;
  const artifactOpen = canUseArtifact && artifactPath !== null && activeConversationId !== null;
  const railExpanded = multiAgent && (isCompact ? compactRailOpen : railOpen) && !artifactOpen;

  const selected = (multiAgent ? pinned : agents).find((a) => a.id === selectedId) ?? null;
  const selectedStatus = selected ? statuses[selected.id] : undefined;

  // Pour l'en-tête mobile seul : le pane remonte, le parent affiche.
  const [contextUsage, setContextUsage] = useState<ConversationContextUsageUio | null>(null);

  // Consulter un agent le marque comme lu, et son badge disparaît sans attendre
  // le prochain sondage.
  useEffect(() => {
    if (!selectedStatus?.conversationId || !selected) return;
    if (selectedStatus.unreadCount === 0) return;

    const agentId = selected.id;
    void api.markConversationRead(selectedStatus.conversationId);
    setStatuses((prev) =>
      prev[agentId] ? { ...prev, [agentId]: { ...prev[agentId], unreadCount: 0 } } : prev,
    );
  }, [selected, selectedStatus?.conversationId, selectedStatus?.unreadCount]);
  const userLabel = userEmail.split('@')[0].replace(/[._-]/g, ' ');
  const userInitials = initials(userLabel);

  const unpin = useCallback(
    (id: string) => setPinnedIds(pinnedIds.filter((pinnedId) => pinnedId !== id)),
    [pinnedIds, setPinnedIds],
  );

  const conversation = selected ? (
    <ConversationPane
      key={selected.id}
      agentId={selected.id}
      agentName={selected.name}
      userLabel={userLabel}
      lang={locale}
      unreadCount={selectedStatus?.unreadCount ?? 0}
      orgId={orgId}
      initialConversationId={
        preferences.agentConversations[selected.id] ?? selectedStatus?.conversationId ?? null
      }
      hideHeader={isMobile}
      features={features}
      ocrAvailable={ocrAvailable}
      onShowDetails={isCompact ? () => setPanelOpen(true) : undefined}
      onConversationChange={setActiveConversationId}
      onContextUsageChange={setContextUsage}
      onOpenArtifact={canUseArtifact ? setArtifactPath : undefined}
      clearConversationRef={isMobile ? clearConversationRef : undefined}
    />
  ) : (
    <div className="bc:flex bc:flex-1 bc:flex-col bc:items-center bc:justify-center bc:gap-3 bc:px-6 bc:text-center">
      <p className="bc:text-sm bc:font-medium bc:text-[#0f172a]">{t('chat.emptyTitle')}</p>
      <p className="bc:max-w-xs bc:text-[13px] bc:text-[#64748b]">{t('chat.emptyDescription')}</p>
    </div>
  );

  const expandedRail = (
    <ExpandedRail
      agents={pinned}
      allAgents={agents}
      statuses={statuses}
      selectedId={selectedId}
      onSelect={(id) => {
        setSelectedId(id);
        setMobileShowsConversation(true);
        if (isCompact) setCompactRailOpen(false);
      }}
      onCollapse={() => (isCompact ? setCompactRailOpen(false) : setRailOpen(false))}
      onPin={(id) => setPinnedIds([...pinnedIds, id])}
      userEmail={userEmail}
      userInitials={userInitials}
      renderUserMenu={renderUserMenu}
      fullWidth={isMobile}
      t={t}
    />
  );

  // ── Mobile : la liste et la conversation sont deux écrans successifs ────────
  if (isMobile) {
    return (
      <div className="bc:flex bc:h-full bc:min-h-0 bc:flex-1 bc:flex-col bc:bg-white bc:text-[#1D1D1F]">
        {!selected || !mobileShowsConversation ? (
          expandedRail
        ) : (
          <>
            <header className="bc:relative bc:z-20 bc:flex bc:items-center bc:gap-2 bc:border-b bc:border-[#E5E5E5] bc:bg-[#FAFBFF] bc:px-3 bc:py-2.5">
              <button
                onClick={() => setMobileShowsConversation(false)}
                aria-label={t('chat.mobile.back')}
                className="bc:flex bc:h-9 bc:w-9 bc:items-center bc:justify-center bc:rounded-lg bc:text-[#525252] bc:hover:bg-[#ECEEFF]"
              >
                <ArrowLeft className="bc:h-[18px] bc:w-[18px]" />
              </button>
              <span
                className="bc:flex bc:h-8 bc:w-8 bc:flex-none bc:items-center bc:justify-center bc:rounded-[9px] bc:text-[12px] bc:font-semibold bc:text-white"
                style={{ background: agentColor(selected.id) }}
              >
                {initials(selected.name)}
              </span>
              <span className="bc:min-w-0 bc:flex-1 bc:truncate bc:text-[14.5px] bc:font-semibold">
                {selected.name}
              </span>
              {/* L'en-tête du pane est masqué en mobile : la jauge de contexte se replie ici. */}
              <ContextWindowGauge usage={contextUsage} />
              <button
                onClick={() => setSheetOpen(true)}
                aria-label={t('chat.mobile.options')}
                className="bc:flex bc:h-9 bc:w-9 bc:items-center bc:justify-center bc:rounded-lg bc:text-[#525252] bc:hover:bg-[#ECEEFF]"
              >
                <MoreHorizontal className="bc:h-[18px] bc:w-[18px]" />
              </button>
            </header>

            {/* Bande d'avatars : changer d'agent sans repasser par la liste. */}
            <div className="bc:flex bc:gap-2 bc:overflow-x-auto bc:border-b bc:border-[#EEF0F7] bc:bg-white bc:px-3 bc:py-2">
              {pinned.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedId(agent.id)}
                  aria-label={agent.name}
                  className="bc:relative bc:flex-none"
                >
                  <span
                    className="bc:flex bc:h-9 bc:w-9 bc:items-center bc:justify-center bc:rounded-[10px] bc:text-[11.5px] bc:font-semibold bc:text-white"
                    style={{
                      background: agentColor(agent.id),
                      opacity: agent.id === selected.id ? 1 : 0.45,
                    }}
                  >
                    {initials(agent.name)}
                  </span>
                  {(statuses[agent.id]?.unreadCount ?? 0) > 0 && (
                    <span className="bc:absolute bc:-right-1 bc:-top-1 bc:flex bc:h-4 bc:min-w-4 bc:items-center bc:justify-center bc:rounded-full bc:border-2 bc:border-white bc:bg-[#004AEB] bc:px-1 bc:text-[9px] bc:font-semibold bc:text-white">
                      {statuses[agent.id].unreadCount}
                    </span>
                  )}
                  {statuses[agent.id]?.isGenerating && (
                    <span className="bc:absolute bc:-bottom-0.5 bc:-right-0.5 bc:h-2.5 bc:w-2.5 bc:rounded-full bc:border-2 bc:border-white bc:bg-[#10B981]" />
                  )}
                </button>
              ))}
            </div>

            <main className="bc:flex bc:min-h-0 bc:flex-1 bc:flex-col">{conversation}</main>
          </>
        )}

        {/* Feuille d'options : détails de l'agent et actions. */}
        {sheetOpen && selected && (
          <div
            className="bc:fixed bc:inset-0 bc:z-50 bc:flex bc:items-end bc:bg-black/40"
            onClick={() => setSheetOpen(false)}
          >
            <div
              className="bc:max-h-[80vh] bc:w-full bc:overflow-y-auto bc:rounded-t-2xl bc:bg-white bc:p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bc:mb-4 bc:flex bc:items-center bc:justify-between">
                <span className="bc:text-[15px] bc:font-semibold">{selected.name}</span>
                <button
                  onClick={() => setSheetOpen(false)}
                  aria-label={t('chat.mobile.close')}
                  className="bc:flex bc:h-8 bc:w-8 bc:items-center bc:justify-center bc:rounded-lg bc:text-[#525252] bc:hover:bg-[#ECEEFF]"
                >
                  <X className="bc:h-4 bc:w-4" />
                </button>
              </div>
              <AgentPanelTabs agent={selected} conversationId={workspaceConversationId} t={t} />
              <button
                type="button"
                onClick={() => {
                  clearConversationRef.current?.();
                  setSheetOpen(false);
                }}
                className="bc:mt-5 bc:w-full bc:rounded-[9px] bc:border bc:border-[#E5E5E5] bc:p-2.5 bc:text-[12.5px] bc:text-[#737373] bc:hover:border-[#FCA5A5] bc:hover:text-[#DC2626]"
              >
                {t('chat.conversation.clear')}
              </button>
              <button
                onClick={() => {
                  unpin(selected.id);
                  setSheetOpen(false);
                  setMobileShowsConversation(false);
                }}
                className="bc:mt-2 bc:w-full bc:rounded-[9px] bc:border bc:border-[#E5E5E5] bc:p-2.5 bc:text-[12.5px] bc:text-[#737373] bc:hover:border-[#FCA5A5] bc:hover:text-[#DC2626]"
              >
                {t('chat.panel.unpin')}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Desktop et compact ─────────────────────────────────────────────────────
  return (
    <div className="bc:relative bc:flex bc:h-full bc:min-h-0 bc:flex-1 bc:bg-white bc:text-[#1D1D1F]">
      {multiAgent ? (
        railExpanded ? (
          expandedRail
        ) : (
        <CollapsedRail
          agents={pinned}
          statuses={statuses}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onExpand={() => (isCompact ? setCompactRailOpen(true) : setRailOpen(true))}
          userInitials={userInitials}
          renderUserMenu={renderUserMenu}
          t={t}
        />
        )
      ) : null}

      {/* Conteneur du partage : sa largeur sert de référence à la poignée. */}
      <div ref={splitRef} className="bc:flex bc:min-w-0 bc:flex-1">
        <main
          className={`bc:flex bc:min-w-0 bc:flex-col bc:bg-white ${artifactOpen ? 'bc:flex-none' : 'bc:flex-1'}`}
          style={
            artifactOpen
              ? {
                  flexBasis: `calc((100% - ${SPLIT_HANDLE_WIDTH_PX}px) * ${
                    (100 - artifactPercent) / 100
                  })`,
                }
              : undefined
          }
        >
          {conversation}
        </main>

        {/* L'artefact prend la place du panneau, qui revient à sa fermeture. */}
        {artifactOpen && (
          <>
            <SplitHandle
              containerRef={splitRef}
              percent={artifactPercent}
              onChange={setArtifactPercent}
              onReset={resetArtifactPercent}
              label={t('chat.workspace.resize')}
            />
            <div
              className="bc:flex bc:min-w-0 bc:flex-none bc:border-l bc:border-[#E5E5E5]"
              style={{
                flexBasis: `calc((100% - ${SPLIT_HANDLE_WIDTH_PX}px) * ${artifactPercent / 100})`,
              }}
            >
              <WorkspaceArtifact
                path={artifactPath}
                storeVersion={workspaceByPath.get(artifactPath)?.version}
                read={(path) => api.readWorkspaceFile(activeConversationId, path)}
                save={(path, content, expectedVersion) =>
                  api.saveWorkspaceFile(activeConversationId, path, content, expectedVersion)
                }
                remove={removeWorkspaceFile}
                onSaved={refreshWorkspace}
                onClose={() => setArtifactPath(null)}
              />
            </div>
          </>
        )}
      </div>

      {/* Le panneau agent est une colonne au-delà de 1280px, un tiroir en deçà. */}
      {selected && !isCompact && !artifactOpen && (
        <AgentPanel
          agent={selected}
          conversationId={workspaceConversationId}
          onOpenArtifact={setArtifactPath}
          onUnpin={() => unpin(selected.id)}
          t={t}
        />
      )}

      {selected && isCompact && panelOpen && (
        <div
          className="bc:absolute bc:inset-0 bc:z-40 bc:flex bc:justify-end bc:bg-black/30"
          onClick={() => setPanelOpen(false)}
        >
          <div className="bc:h-full bc:w-[300px] bc:bg-[#FAFBFF]" onClick={(e) => e.stopPropagation()}>
            <AgentPanel
              agent={selected}
              conversationId={workspaceConversationId}
              onUnpin={() => unpin(selected.id)}
              onClose={() => setPanelOpen(false)}
              t={t}
            />
          </div>
        </div>
      )}
    </div>
  );
}
