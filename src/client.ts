import {
  AgentApi,
  Configuration,
  ConversationsApi,
  PromptsApi,
  ResponseError,
  SkillsApi,
  type AttachmentCreateRequestUio,
  type AttachmentCreateResponseUio,
  type ChatMessageUio,
  type ChatUio,
  type InitOverrideFunction,
  type MessageStatusUio,
  type ToolCallResultRequestUio,
  type ToolCallUio,
  type UserChatPreferencesUio,
  type WorkspaceFileContentUio,
  type WorkspaceFileEntryUio,
} from '@breign/client';

export type ChatApiConfig = {
  baseUrl: string;
  getHeaders: () => Promise<Record<string, string>> | Record<string, string>;
};

export type WorkspaceListing = {
  files: WorkspaceFileEntryUio[];
  fileCount: number;
  totalBytes: number;
};

export type WorkspaceSaveResult =
  | { status: 'saved'; file: WorkspaceFileContentUio }
  | { status: 'conflict'; currentVersion: number | null }
  | { status: 'gone' }
  | { status: 'error'; message: string };

export type SendMessageInput = {
  agentId: string;
  conversationId?: string;
  message: string;
  lang: string;
};

export type AttachmentRequestInput = {
  conversationId: string;
  fileDescription: {
    type: 'image' | 'file';
    name: string;
    mimeType: string;
    ext: string;
    size: number;
    dataUrl?: string;
    ocr?: boolean;
  };
};

const EMPTY_LISTING: WorkspaceListing = { files: [], fileCount: 0, totalBytes: 0 };

export type SendErrorCode =
  | 'NO_ENGINE_CONFIGURED'
  | 'MODEL_TOOLS_NOT_SUPPORTED'
  | 'MODEL_VISION_NOT_SUPPORTED'
  | 'API';

export class ChatApiError extends Error {
  readonly code: SendErrorCode;
  readonly detail?: string;

  constructor(code: SendErrorCode, detail?: string) {
    super(code === 'API' ? (detail ?? 'API') : code);
    this.name = 'ChatApiError';
    this.code = code;
    this.detail = detail;
  }
}

function readErrorFields(body: unknown): { code?: string; message?: string } {
  if (!body || typeof body !== 'object') return {};
  const record = body as {
    message?: unknown;
    code?: unknown;
    error?: { message?: unknown; code?: unknown };
  };
  const code = record.error?.code ?? record.code;
  const message = record.error?.message ?? record.message;
  return {
    code: typeof code === 'string' ? code : undefined,
    message: typeof message === 'string' ? message : undefined,
  };
}

function sendMessageError(status: number, body: unknown): ChatApiError {
  const { code, message } = readErrorFields(body);
  if (
    code === 'NO_ENGINE_CONFIGURED' ||
    code === 'MODEL_TOOLS_NOT_SUPPORTED' ||
    code === 'MODEL_VISION_NOT_SUPPORTED'
  ) {
    return new ChatApiError(code);
  }
  return new ChatApiError('API', message ?? `status ${status}`);
}

function readCount(header: string | null): number {
  const value = Number.parseInt(header ?? '', 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function createChatApi(config: ChatApiConfig) {
  const basePath = config.baseUrl.replace(/\/$/, '');
  const configuration = new Configuration({ basePath });
  const conversations = new ConversationsApi(configuration);
  const prompts = new PromptsApi(configuration);
  const agents = new AgentApi(configuration);
  const skills = new SkillsApi(configuration);

  async function auth(): Promise<InitOverrideFunction> {
    const extra = await config.getHeaders();
    return async ({ init }) => ({
      headers: { ...init.headers, ...extra },
    });
  }

  return {
    async fetchChatPreferences(organizationId: string): Promise<UserChatPreferencesUio> {
      return conversations.getUserChatPreferences(organizationId, await auth());
    },

    async fetchAgentChatOverview(organizationId: string) {
      try {
        return await conversations.getAgentChatOverview(organizationId, await auth());
      } catch (error) {
        console.error('[fetchAgentChatOverview] request failed', error);
        return [];
      }
    },

    async markConversationRead(conversationId: string): Promise<void> {
      try {
        await conversations.markConversationAsRead(
          conversationId,
          { readAt: new Date() },
          await auth(),
        );
      } catch (error) {
        console.error('[markConversationRead] request failed', error);
      }
    },

    async updateChatPreferences(
      organizationId: string,
      changes: { pinnedAgentIds?: string[]; railOpen?: boolean },
    ): Promise<void> {
      try {
        await conversations.updateUserChatPreferences(organizationId, changes, await auth());
      } catch (error) {
        console.error('[updateChatPreferences] request failed', error);
      }
    },

    async setAgentConversation(
      organizationId: string,
      agentId: string,
      conversationId: string,
    ): Promise<void> {
      try {
        await conversations.setUserAgentConversation(
          organizationId,
          agentId,
          { conversationId },
          await auth(),
        );
      } catch (error) {
        console.error('[setAgentConversation] request failed', error);
      }
    },

    async createConversation(agentId: string, lang: string): Promise<{ id: string }> {
      const result = await prompts.createConversation(agentId, { lang }, undefined, await auth());
      return { id: result.id };
    },

    async sendMessage(input: SendMessageInput) {
      const headers = await config.getHeaders();
      const path = input.conversationId
        ? `/conversations/${input.conversationId}/prompts?async=true`
        : `/agents/${input.agentId}/prompts?async=true`;
      const response = await fetch(`${basePath}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ message: input.message, lang: input.lang, stream: true }),
      });
      if (!response.ok) {
        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }
        throw sendMessageError(response.status, body);
      }
      const result = (await response.json()) as {
        text?: string;
        conversationId?: string;
        messageId?: string;
        toolsUsed?: string[];
      };
      return {
        success: true as const,
        data: {
          text: result.text,
          conversationId: input.conversationId || result.conversationId,
          messageId: result.messageId,
          toolsUsed: Array.isArray(result.toolsUsed) ? result.toolsUsed : [],
        },
      };
    },

    async requestAttachment(input: AttachmentRequestInput): Promise<AttachmentCreateResponseUio> {
      const file = input.fileDescription;
      const dataUrl = file.dataUrl;
      const shouldSendDataUrl =
        file.type === 'image' && typeof dataUrl === 'string' && dataUrl.startsWith('data:image/');
      const request: AttachmentCreateRequestUio =
        file.type === 'image'
          ? {
              type: 'image',
              name: file.name,
              mimeType: file.mimeType,
              ext: file.ext,
              size: file.size,
              ...(shouldSendDataUrl ? { dataUrl } : {}),
            }
          : {
              type: 'file',
              name: file.name,
              mimeType: file.mimeType,
              ext: file.ext,
              size: file.size,
              ...(file.ocr ? { ocr: true } : {}),
            };
      return conversations.uploadAttachment(input.conversationId, request, await auth());
    },

    async markAttachmentUploaded(conversationId: string, attachmentId: string): Promise<void> {
      await conversations.updateAttachmentStatus(conversationId, attachmentId, await auth());
    },

    async getMessageContent(conversationId: string, messageId: string): Promise<ChatMessageUio> {
      return prompts.getMessageById(conversationId, messageId, await auth());
    },

    async getMessageStatus(conversationId: string, messageId: string): Promise<MessageStatusUio> {
      return prompts.getMessageStatus(conversationId, messageId, await auth());
    },

    async getPendingToolCalls(conversationId: string, messageId: string): Promise<ToolCallUio[]> {
      const response = await conversations.listMessageToolCalls(
        conversationId,
        messageId,
        true,
        await auth(),
      );
      return response.toolCalls ?? [];
    },

    async submitToolCallResult(
      conversationId: string,
      messageId: string,
      callId: string,
      body: ToolCallResultRequestUio,
    ): Promise<void> {
      await conversations.submitMessageToolCallResult(
        conversationId,
        messageId,
        callId,
        body,
        await auth(),
      );
    },

    async fetchConversation(agentId: string, conversationId: string): Promise<ChatUio | null> {
      try {
        return await agents.getAgentConversationById(agentId, conversationId, await auth());
      } catch (error) {
        if (error instanceof ResponseError && error.response.status === 404) return null;
        throw error;
      }
    },

    async getAgentCommands(agentId: string) {
      return skills.getAgentAvailableCommands(agentId, await auth());
    },

    async listWorkspaceFiles(conversationId: string): Promise<WorkspaceListing> {
      if (!conversationId) return EMPTY_LISTING;
      try {
        const response = await conversations.listConversationWorkspaceFilesRaw(
          { conversationId },
          await auth(),
        );
        return {
          files: await response.value(),
          fileCount: readCount(response.raw.headers.get('X-Workspace-File-Count')),
          totalBytes: readCount(response.raw.headers.get('X-Workspace-Total-Bytes')),
        };
      } catch (error) {
        console.error('[listWorkspaceFiles] request failed', { conversationId, error });
        return EMPTY_LISTING;
      }
    },

    async readWorkspaceFile(
      conversationId: string,
      path: string,
    ): Promise<WorkspaceFileContentUio | null> {
      try {
        return await conversations.getConversationWorkspaceFileContent(
          conversationId,
          path,
          await auth(),
        );
      } catch (error) {
        if (error instanceof ResponseError && error.response.status === 404) return null;
        throw error;
      }
    },

    async deleteWorkspaceFile(conversationId: string, path: string): Promise<void> {
      await conversations.deleteConversationWorkspaceFile(conversationId, path, await auth());
    },

    async saveWorkspaceFile(
      conversationId: string,
      path: string,
      content: string,
      expectedVersion: number,
    ): Promise<WorkspaceSaveResult> {
      try {
        const file = await conversations.editConversationWorkspaceFileContent(
          conversationId,
          { path, content, expectedVersion },
          await auth(),
        );
        return { status: 'saved', file };
      } catch (error) {
        if (error instanceof ResponseError && error.response.status === 409) {
          let currentVersion: number | null = null;
          try {
            const body = (await error.response.json()) as { currentVersion?: number | null };
            currentVersion = body.currentVersion ?? null;
          } catch {
            currentVersion = null;
          }
          return { status: 'conflict', currentVersion };
        }
        if (error instanceof ResponseError && error.response.status === 404) return { status: 'gone' };
        if (error instanceof ResponseError) {
          try {
            const body = (await error.response.json()) as { error?: string };
            if (body.error) return { status: 'error', message: body.error };
          } catch {
            /* pas de corps JSON */
          }
        }
        return { status: 'error', message: 'save-failed' };
      }
    },
  };
}

export type ChatApi = ReturnType<typeof createChatApi>;
