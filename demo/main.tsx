import { AgentApi, Configuration, OrganizationsApi, ResponseError } from '@breign/client';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BreignChat, type ChatAgent, type ChatFeatures } from '../src/index';
import '../src/styles.css';
import './demo.css';

type Draft = {
  baseUrl: string;
  token: string;
  organizationId: string;
  agentId: string;
  agentName: string;
  userEmail: string;
  locale: 'fr' | 'en';
  features: Required<ChatFeatures>;
};

type OrganizationOption = { id: string; name: string; slug: string };

type OrgList =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; organizations: OrganizationOption[] };

type AgentList =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; agents: ChatAgent[] };

type Panel =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; draft: Draft; agents: ChatAgent[] };

const STORAGE_KEY = 'breign-chat-demo';

const DEFAULT_DRAFT: Draft = {
  baseUrl: 'http://localhost:3000',
  token: '',
  organizationId: '',
  agentId: '',
  agentName: 'Support',
  userEmail: 'ada@example.com',
  locale: 'fr',
  features: {
    multiAgent: false,
    workspace: true,
    approvals: true,
    attachments: true,
  },
};

function loadDraft(): Draft {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DRAFT;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return {
      ...DEFAULT_DRAFT,
      ...parsed,
      features: { ...DEFAULT_DRAFT.features, ...parsed.features },
      locale: parsed.locale === 'en' ? 'en' : 'fr',
    };
  } catch {
    return DEFAULT_DRAFT;
  }
}

function authHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function clientConfiguration(baseUrl: string): Configuration {
  return new Configuration({ basePath: baseUrl.replace(/\/$/, '') });
}

async function listAccessibleOrganizations(
  baseUrl: string,
  token: string,
): Promise<OrganizationOption[]> {
  const api = new OrganizationsApi(clientConfiguration(baseUrl));
  const headers = authHeaders(token);
  const listed = await api.listOrganizations(async ({ init }) => ({
    headers: { ...init.headers, ...headers },
  }));
  return listed
    .map((organization) => ({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

async function listOrganizationAgents(
  baseUrl: string,
  organizationId: string,
  token: string,
): Promise<ChatAgent[]> {
  const api = new AgentApi(clientConfiguration(baseUrl));
  const headers = authHeaders(token);
  const listed = await api.listOrganizationAgents(
    organizationId,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    async ({ init }) => ({
      headers: { ...init.headers, ...headers },
    }),
  );
  return listed
    .map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description ?? '',
      tools: (agent.tools ?? []).map((tool) => tool.name).filter((name) => name.length > 0),
      sandboxEnabled: agent.sandboxConfiguration?.enabled === true,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

async function readFailure(error: unknown): Promise<string> {
  if (error instanceof ResponseError) {
    try {
      const body = (await error.response.json()) as { message?: string; error?: { message?: string } };
      return body.error?.message ?? body.message ?? `Erreur ${error.response.status}`;
    } catch {
      return `Erreur ${error.response.status}`;
    }
  }
  return error instanceof Error ? error.message : 'Impossible de charger.';
}

function Demo() {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [orgs, setOrgs] = useState<OrgList>({ status: 'idle' });
  const [agentList, setAgentList] = useState<AgentList>({ status: 'idle' });
  const [panel, setPanel] = useState<Panel>({ status: 'idle' });
  const orgRequest = useRef(0);
  const agentRequest = useRef(0);

  async function loadOrganizations(baseUrl: string, token: string) {
    const request = ++orgRequest.current;
    if (!baseUrl.trim() || !token.trim()) {
      setOrgs({ status: 'idle' });
      return;
    }
    setOrgs({ status: 'loading' });
    try {
      const organizations = await listAccessibleOrganizations(baseUrl.trim(), token.trim());
      if (request !== orgRequest.current) return;
      setOrgs({ status: 'ready', organizations });
      setDraft((current) => {
        if (organizations.some((organization) => organization.id === current.organizationId)) {
          return current;
        }
        return { ...current, organizationId: organizations[0]?.id ?? '' };
      });
    } catch (error) {
      if (request !== orgRequest.current) return;
      setOrgs({ status: 'error', message: await readFailure(error) });
    }
  }

  useEffect(() => {
    if (draft.baseUrl && draft.token) void loadOrganizations(draft.baseUrl, draft.token);
    // Chargement initial seulement : retaper le jeton ne relance pas la liste à chaque frappe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (orgs.status !== 'ready' || !draft.organizationId.trim()) {
      agentRequest.current += 1;
      setAgentList({ status: 'idle' });
      return;
    }
    const request = ++agentRequest.current;
    const { baseUrl, organizationId, token } = draft;
    setAgentList({ status: 'loading' });
    void listOrganizationAgents(baseUrl, organizationId.trim(), token)
      .then((listed) => {
        if (request !== agentRequest.current) return;
        setAgentList({ status: 'ready', agents: listed });
        setDraft((current) => {
          const selected = listed.find((agent) => agent.id === current.agentId);
          if (selected) {
            return selected.name === current.agentName ? current : { ...current, agentName: selected.name };
          }
          return {
            ...current,
            agentId: listed[0]?.id ?? '',
            agentName: listed[0]?.name ?? '',
          };
        });
      })
      .catch((error: unknown) => {
        if (request !== agentRequest.current) return;
        void readFailure(error).then((message) => {
          if (request !== agentRequest.current) return;
          setAgentList({ status: 'error', message });
        });
      });
    // L'adresse n'est pas une dépendance : la saisie ne relance pas la liste.
    // Au blur, les organisations repassent par « loading », ce qui recharge les agents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgs.status, draft.organizationId, draft.token]);

  function update(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function openChat() {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    if (!draft.organizationId.trim()) {
      setPanel({ status: 'error', message: 'Choisis une organisation.' });
      return;
    }
    if (agentList.status === 'error') {
      setPanel({ status: 'error', message: agentList.message });
      return;
    }
    if (agentList.status !== 'ready') {
      setPanel({ status: 'error', message: 'Les agents de cette organisation ne sont pas encore chargés.' });
      return;
    }
    if (agentList.agents.length === 0) {
      setPanel({ status: 'error', message: 'Cette organisation n’a aucun agent.' });
      return;
    }
    if (!draft.features.multiAgent) {
      const selected = agentList.agents.find((agent) => agent.id === draft.agentId);
      if (!selected) {
        setPanel({ status: 'error', message: 'Choisis un agent.' });
        return;
      }
      setPanel({ status: 'ready', draft, agents: [selected] });
      return;
    }
    setPanel({ status: 'ready', draft, agents: agentList.agents });
  }

  return (
    <div className="page">
      <header className="bar">
        <div className="fields">
          <label>
            API
            <input
              value={draft.baseUrl}
              onChange={(event) => update({ baseUrl: event.target.value })}
              onBlur={(event) => void loadOrganizations(event.currentTarget.value, draft.token)}
            />
          </label>
          <label>
            Jeton
            <input
              type="password"
              value={draft.token}
              autoComplete="off"
              onChange={(event) => {
                orgRequest.current += 1;
                update({ token: event.target.value });
                setOrgs({ status: 'idle' });
              }}
              onBlur={(event) => void loadOrganizations(draft.baseUrl, event.currentTarget.value)}
            />
          </label>
          <label>
            Organisation
            <select
              value={orgs.status === 'ready' ? draft.organizationId : ''}
              disabled={orgs.status !== 'ready' || orgs.organizations.length === 0}
              onChange={(event) => update({ organizationId: event.target.value })}
            >
              {orgs.status === 'ready' ? (
                orgs.organizations.length === 0 ? (
                  <option value="">Aucune organisation</option>
                ) : (
                  orgs.organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))
                )
              ) : (
                <option value="">
                  {orgs.status === 'loading'
                    ? 'Chargement…'
                    : orgs.status === 'error'
                      ? 'Impossible de charger'
                      : 'Colle le jeton'}
                </option>
              )}
            </select>
            {orgs.status === 'error' ? <span className="field-error">{orgs.message}</span> : null}
            {draft.features.multiAgent && orgs.status !== 'error' && agentList.status === 'error' ? (
              <span className="field-error">{agentList.message}</span>
            ) : null}
          </label>
          {draft.features.multiAgent ? null : (
            <label>
              Agent
              <select
                value={agentList.status === 'ready' ? draft.agentId : ''}
                disabled={agentList.status !== 'ready' || agentList.agents.length === 0}
                onChange={(event) => {
                  const selected =
                    agentList.status === 'ready'
                      ? agentList.agents.find((agent) => agent.id === event.target.value)
                      : undefined;
                  update({ agentId: event.target.value, agentName: selected?.name ?? '' });
                }}
              >
                {agentList.status === 'ready' ? (
                  agentList.agents.length === 0 ? (
                    <option value="">Aucun agent</option>
                  ) : (
                    agentList.agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))
                  )
                ) : (
                  <option value="">
                    {agentList.status === 'loading'
                      ? 'Chargement…'
                      : agentList.status === 'error'
                        ? 'Impossible de charger'
                        : 'Choisis une organisation'}
                  </option>
                )}
              </select>
              {agentList.status === 'error' ? <span className="field-error">{agentList.message}</span> : null}
            </label>
          )}
          <label>
            Langue
            <select
              value={draft.locale}
              onChange={(event) => update({ locale: event.target.value === 'en' ? 'en' : 'fr' })}
            >
              <option value="fr">fr</option>
              <option value="en">en</option>
            </select>
          </label>
        </div>
        <div className="row">
          {(
            [
              ['multiAgent', 'Plusieurs agents'],
              ['workspace', 'Fichiers'],
              ['approvals', 'Autorisations'],
              ['attachments', 'Pièces jointes'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="check">
              <input
                type="checkbox"
                checked={draft.features[key]}
                onChange={(event) =>
                  update({ features: { ...draft.features, [key]: event.target.checked } })
                }
              />
              {label}
            </label>
          ))}
          <button
            type="button"
            className="open"
            onClick={openChat}
            disabled={agentList.status === 'loading'}
          >
            {agentList.status === 'loading' ? 'Chargement…' : 'Ouvrir le chat'}
          </button>
        </div>
      </header>
      <div className="panel">
        {panel.status === 'ready' ? (
          <BreignChat
            key={JSON.stringify({ draft: panel.draft, agents: panel.agents.map((agent) => agent.id) })}
            api={{
              baseUrl: panel.draft.baseUrl,
              getHeaders: async () => {
                const headers: Record<string, string> = {};
                if (panel.draft.token) headers.Authorization = `Bearer ${panel.draft.token}`;
                return headers;
              },
            }}
            organizationId={panel.draft.organizationId}
            locale={panel.draft.locale}
            userEmail={panel.draft.userEmail}
            features={panel.draft.features}
            agents={panel.agents}
          />
        ) : panel.status === 'error' ? (
          <p className="hint error">{panel.message}</p>
        ) : (
          <p className="hint">
            {draft.features.multiAgent
              ? 'Plusieurs agents : tous les agents de l’organisation seront ouverts.'
              : 'Un seul agent : choisis-le dans la liste.'}
          </p>
        )}
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<Demo />);
