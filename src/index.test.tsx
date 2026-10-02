// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BreignChat } from './index';

const { fetchChatPreferences } = vi.hoisted(() => ({
  fetchChatPreferences: vi.fn(),
}));

vi.mock('./client', () => ({
  createChatApi: () => ({ fetchChatPreferences }),
  ChatApiError: class ChatApiError extends Error {},
}));

vi.mock('sonner', () => ({
  Toaster: () => null,
}));

let root: Root | undefined;

function renderChat() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <BreignChat
        api={{ baseUrl: 'http://localhost:8080', getHeaders: () => ({}) }}
        organizationId="org_1"
        agents={[{ id: 'agent_1', name: 'Support' }]}
      />,
    );
  });
}

async function waitForText(text: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (document.body.textContent?.includes(text)) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  throw new Error(`texte introuvable : ${text}`);
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  document.body.innerHTML = '';
  fetchChatPreferences.mockReset();
});

describe('chargement des préférences', () => {
  it('affiche l’erreur et relance le chargement au clic sur Réessayer', async () => {
    fetchChatPreferences.mockRejectedValue(new Error('down'));
    renderChat();

    await waitForText('Impossible de charger le chat.');
    const button = [...document.querySelectorAll('button')].find((node) => node.textContent === 'Réessayer');
    expect(button).toBeInstanceOf(HTMLButtonElement);
    expect(fetchChatPreferences).toHaveBeenCalledTimes(1);
    expect(fetchChatPreferences).toHaveBeenCalledWith('org_1');

    await act(async () => {
      button?.click();
    });
    await waitForText('Impossible de charger le chat.');

    expect(fetchChatPreferences).toHaveBeenCalledTimes(2);
    expect(fetchChatPreferences).toHaveBeenNthCalledWith(2, 'org_1');
  });
});
