import { createContext, useContext, type ReactNode } from 'react';
import type { ChatApi } from './client';

const ChatApiContext = createContext<ChatApi | null>(null);

export function ChatApiProvider({ api, children }: { api: ChatApi; children: ReactNode }) {
  return <ChatApiContext.Provider value={api}>{children}</ChatApiContext.Provider>;
}

export function useChatApi(): ChatApi {
  const api = useContext(ChatApiContext);
  if (!api) throw new Error('BreignChat doit être rendu avec une configuration api.');
  return api;
}
