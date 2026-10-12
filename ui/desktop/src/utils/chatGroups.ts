import type { SessionListItem } from '../acp/sessions';

export const CHAT_GROUPS_STORAGE_KEY = 'goose.desktop.chatGroups.v1';

export interface ChatGroup {
  id: string;
  name: string;
}

export interface ChatGroupsState {
  groups: ChatGroup[];
  sessionGroupIds: Record<string, string>;
}

export function emptyChatGroups(): ChatGroupsState {
  return { groups: [], sessionGroupIds: {} };
}

export function parseChatGroups(raw: string | null): ChatGroupsState {
  if (!raw) return emptyChatGroups();
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return emptyChatGroups();
    const candidate = value as Partial<ChatGroupsState>;
    if (!Array.isArray(candidate.groups)) return emptyChatGroups();
    const groups = candidate.groups.filter(
      (group): group is ChatGroup =>
        !!group &&
        typeof group.id === 'string' &&
        !!group.id &&
        typeof group.name === 'string' &&
        !!group.name.trim()
    );
    const validIds = new Set(groups.map((group) => group.id));
    const sessionGroupIds: Record<string, string> = {};
    if (
      candidate.sessionGroupIds &&
      typeof candidate.sessionGroupIds === 'object' &&
      !Array.isArray(candidate.sessionGroupIds)
    ) {
      for (const [sessionId, groupId] of Object.entries(candidate.sessionGroupIds)) {
        if (sessionId && typeof groupId === 'string' && validIds.has(groupId)) {
          sessionGroupIds[sessionId] = groupId;
        }
      }
    }
    return { groups, sessionGroupIds };
  } catch {
    return emptyChatGroups();
  }
}

export function createChatGroup(state: ChatGroupsState, id: string, name: string): ChatGroupsState {
  const trimmed = name.trim();
  if (!trimmed || !id || state.groups.some((group) => group.id === id)) return state;
  return { ...state, groups: [...state.groups, { id, name: trimmed }] };
}

export function renameChatGroup(state: ChatGroupsState, id: string, name: string): ChatGroupsState {
  const trimmed = name.trim();
  if (!trimmed || !state.groups.some((group) => group.id === id)) return state;
  return {
    ...state,
    groups: state.groups.map((group) => (group.id === id ? { ...group, name: trimmed } : group)),
  };
}

export function deleteChatGroup(state: ChatGroupsState, id: string): ChatGroupsState {
  if (!state.groups.some((group) => group.id === id)) return state;
  return {
    groups: state.groups.filter((group) => group.id !== id),
    sessionGroupIds: Object.fromEntries(
      Object.entries(state.sessionGroupIds).filter(([, groupId]) => groupId !== id)
    ),
  };
}

export function assignChatGroup(
  state: ChatGroupsState,
  sessionId: string,
  groupId: string | null
): ChatGroupsState {
  if (!sessionId || (groupId !== null && !state.groups.some((group) => group.id === groupId)))
    return state;
  const sessionGroupIds = { ...state.sessionGroupIds };
  if (groupId === null) delete sessionGroupIds[sessionId];
  else sessionGroupIds[sessionId] = groupId;
  return { ...state, sessionGroupIds };
}

export function groupRecentChats(sessions: SessionListItem[], state: ChatGroupsState) {
  return {
    groups: state.groups.map((group) => ({
      ...group,
      sessions: sessions.filter((session) => state.sessionGroupIds[session.id] === group.id),
    })),
    ungrouped: sessions.filter(
      (session) =>
        !state.sessionGroupIds[session.id] ||
        !state.groups.some((group) => group.id === state.sessionGroupIds[session.id])
    ),
  };
}
