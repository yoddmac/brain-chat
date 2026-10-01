'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Toaster } from 'sonner';
import { ChatApiProvider } from './api-context';
import { MultiAgentChat } from './chat/components';
import { createChatApi } from './client';
import { I18nProvider, useLocale } from './i18n/locale';
import type { BreignChatProps } from './types';

const CHAT_ROOT = 'breign-chat';

const DEFAULT_FEATURES = {
  multiAgent: true,
  workspace: true,
  approvals: true,
  attachments: true,
};

type Preferences = {
  pinnedAgentIds: string[];
  railOpen: boolean;
  agentConversations: Record<string, string>;
};

function PreferencesStatus({
  phase,
  onRetry,
}: {
  phase: 'loading' | 'error';
  onRetry: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="bc:flex bc:h-full bc:min-h-0 bc:flex-1 bc:flex-col bc:items-center bc:justify-center bc:gap-3 bc:px-6 bc:text-center bc:text-sm bc:text-[#8A8FA8]">
      {phase === 'loading' ? (
        <span>{t('chat.loading')}</span>
      ) : (
        <>
          <p>{t('chat.loadFailed')}</p>
          <button
            type="button"
            onClick={onRetry}
            className="bc:rounded-md bc:bg-[#004AEB] bc:px-3 bc:py-1.5 bc:text-sm bc:font-medium bc:text-white"
          >
            {t('chat.retry')}
          </button>
        </>
      )}
    </div>
  );
}

export function BreignChat({
  api,
  organizationId,
  agents,
  locale = 'fr',
  labels,
  features,
  userEmail = '',
  renderUserMenu,
  ocrAvailable = false,
}: BreignChatProps) {
  const headersRef = useRef(api.getHeaders);
  headersRef.current = api.getHeaders;
  const chatApi = useMemo(
    () => createChatApi({ baseUrl: api.baseUrl, getHeaders: () => headersRef.current() }),
    [api.baseUrl],
  );

  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPhase('loading');
    setPreferences(null);
    void chatApi.fetchChatPreferences(organizationId).then(
      (loaded) => {
        if (cancelled) return;
        setPreferences({
          pinnedAgentIds: loaded.pinnedAgentIds,
          railOpen: loaded.railOpen,
          agentConversations: Object.fromEntries(
            loaded.agentConversations.map((entry) => [entry.agentId, entry.conversationId]),
          ),
        });
        setPhase('ready');
      },
      () => {
        if (!cancelled) setPhase('error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [chatApi, organizationId, attempt]);

  const resolvedFeatures = { ...DEFAULT_FEATURES, ...features };
  const visibleAgents = resolvedFeatures.multiAgent ? agents : agents.slice(0, 1);

  return (
    <div className={CHAT_ROOT}>
      <ChatApiProvider api={chatApi}>
        <I18nProvider locale={locale} labels={labels}>
          {phase === 'ready' && preferences ? (
            <MultiAgentChat
              orgId={organizationId}
              preferences={preferences}
              userEmail={userEmail}
              features={resolvedFeatures}
              renderUserMenu={renderUserMenu}
              ocrAvailable={ocrAvailable}
              agents={visibleAgents.map((agent) => ({
                id: agent.id,
                name: agent.name,
                description: agent.description ?? '',
                tools: agent.tools ?? [],
                sandboxEnabled: agent.sandboxEnabled === true,
              }))}
            />
          ) : (
            <PreferencesStatus
              phase={phase === 'error' ? 'error' : 'loading'}
              onRetry={() => setAttempt((value) => value + 1)}
            />
          )}
          <Toaster position="top-right" />
        </I18nProvider>
      </ChatApiProvider>
    </div>
  );
}

export type { BreignChatProps, ChatAgent, ChatApiConfig, ChatFeatures, RenderUserMenu } from './types';
export { ChatApiError, createChatApi, type ChatApi, type SendErrorCode } from './client';
