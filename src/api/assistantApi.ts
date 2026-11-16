import { api } from './client';

export interface AssistantChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantDocumentContext {
  name: string;
  text: string;
}

export interface AssistantAction {
  kind?: 'navigate' | 'recapUpdate' | 'confirm';
  label: string;
  route?: string;
  field?: string;
  value?: string;
  voyageId?: string;
  actionId?: string;
  summary?: string;
  completed?: boolean;
  dismissed?: boolean;
  busy?: boolean;
}

export interface AssistantConfirmResult {
  success: boolean;
  message: string;
}

export interface AssistantChatResponse {
  reply: string;
  actions: AssistantAction[];
  conversationId?: string | null;
}

export interface AssistantConversationSummary {
  id: string;
  title: string;
  lastMessageAtUtc: string;
  messageCount: number;
}

export interface AssistantConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAtUtc: string;
  actions: AssistantAction[];
}

export interface AssistantConversationDetail {
  id: string;
  title: string;
  lastMessageAtUtc: string;
  messages: AssistantConversationMessage[];
}

export const assistantApi = {
  chat(input: {
    message: string;
    history: AssistantChatMessage[];
    context: unknown;
    documents: AssistantDocumentContext[];
    conversationId?: string | null;
  }): Promise<AssistantChatResponse> {
    return api.post<AssistantChatResponse>('/api/assistant/chat', input);
  },
  confirmAction(actionId: string): Promise<AssistantConfirmResult> {
    return api.post<AssistantConfirmResult>(`/api/assistant/actions/${encodeURIComponent(actionId)}/confirm`, {});
  },
  cancelAction(actionId: string): Promise<AssistantConfirmResult> {
    return api.post<AssistantConfirmResult>(`/api/assistant/actions/${encodeURIComponent(actionId)}/cancel`, {});
  },
  listConversations(search?: string): Promise<AssistantConversationSummary[]> {
    const query = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    return api.get<AssistantConversationSummary[]>(`/api/assistant/conversations${query}`);
  },
  getConversation(id: string): Promise<AssistantConversationDetail> {
    return api.get<AssistantConversationDetail>(`/api/assistant/conversations/${encodeURIComponent(id)}`);
  },
  renameConversation(id: string, title: string): Promise<AssistantConversationSummary> {
    return api.put<AssistantConversationSummary>(`/api/assistant/conversations/${encodeURIComponent(id)}`, { title });
  },
  deleteConversation(id: string): Promise<unknown> {
    return api.delete<unknown>(`/api/assistant/conversations/${encodeURIComponent(id)}`);
  },
  deleteAllConversations(): Promise<unknown> {
    return api.delete<unknown>('/api/assistant/conversations');
  },
};