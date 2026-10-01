import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatApiError, createChatApi } from './client';

function api() {
  return createChatApi({
    baseUrl: 'https://api.example.test/',
    getHeaders: async () => ({ Authorization: 'Bearer token' }),
  });
}

function stubFetch(status: number, body?: string) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(body ?? '', { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sendMessage', () => {
  it('poste le message sur la conversation et renvoie les identifiants', async () => {
    const fetchMock = stubFetch(
      200,
      JSON.stringify({
        text: 'bonjour',
        conversationId: 'conv_1',
        messageId: 'msg_1',
        toolsUsed: ['search'],
      }),
    );

    const result = await api().sendMessage({
      agentId: 'agent_1',
      conversationId: 'conv_1',
      message: 'salut',
      lang: 'fr',
    });

    expect(result.data).toEqual({
      text: 'bonjour',
      conversationId: 'conv_1',
      messageId: 'msg_1',
      toolsUsed: ['search'],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(init).toBeDefined();
    if (!init) return;
    expect(url).toBe('https://api.example.test/conversations/conv_1/prompts?async=true');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer token',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init.body))).toEqual({ message: 'salut', lang: 'fr', stream: true });
  });

  it('crée le prompt sur l’agent quand aucune conversation n’est encore ouverte', async () => {
    const fetchMock = stubFetch(200, JSON.stringify({ conversationId: 'conv_new', messageId: 'msg_2' }));

    const result = await api().sendMessage({ agentId: 'agent_1', message: 'salut', lang: 'en' });

    expect(result.data.toolsUsed).toEqual([]);
    expect(result.data.conversationId).toBe('conv_new');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.test/agents/agent_1/prompts?async=true');
  });

  it.each([
    'NO_ENGINE_CONFIGURED',
    'MODEL_TOOLS_NOT_SUPPORTED',
    'MODEL_VISION_NOT_SUPPORTED',
  ] as const)('traduit le code %s sans garder le message du serveur', async (code) => {
    stubFetch(400, JSON.stringify({ error: { code, message: 'texte serveur' } }));

    const error = await api()
      .sendMessage({ agentId: 'agent_1', message: 'salut', lang: 'fr' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ChatApiError);
    expect(error).toMatchObject({ code, detail: undefined });
  });

  it('accepte le code au premier niveau du corps', async () => {
    stubFetch(422, JSON.stringify({ code: 'MODEL_VISION_NOT_SUPPORTED' }));

    await expect(
      api().sendMessage({ agentId: 'agent_1', message: 'salut', lang: 'fr' }),
    ).rejects.toMatchObject({ code: 'MODEL_VISION_NOT_SUPPORTED' });
  });

  it('garde le message du serveur pour une erreur inconnue', async () => {
    stubFetch(500, JSON.stringify({ message: 'quota dépassé' }));

    await expect(
      api().sendMessage({ agentId: 'agent_1', message: 'salut', lang: 'fr' }),
    ).rejects.toMatchObject({ code: 'API', detail: 'quota dépassé' });
  });

  it('retombe sur le statut quand le corps n’est pas du JSON', async () => {
    stubFetch(502, 'pas du json');

    await expect(
      api().sendMessage({ agentId: 'agent_1', message: 'salut', lang: 'fr' }),
    ).rejects.toMatchObject({ code: 'API', detail: 'status 502' });
  });
});
