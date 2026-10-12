import { useCallback, useMemo, useSyncExternalStore, type SetStateAction } from 'react';
import {
  CHAT_GROUPS_CHANGED_EVENT,
  CHAT_GROUPS_STORAGE_KEY,
  type ChatGroupsState,
  parseChatGroups,
  readChatGroups,
  saveChatGroups,
} from '../utils/chatGroups';

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === CHAT_GROUPS_STORAGE_KEY || event.key === null) onChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHAT_GROUPS_CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHAT_GROUPS_CHANGED_EVENT, onChange);
  };
}

function getSnapshot(): string | null {
  return localStorage.getItem(CHAT_GROUPS_STORAGE_KEY);
}

export function useChatGroups(): [
  ChatGroupsState,
  (update: SetStateAction<ChatGroupsState>) => void,
] {
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const groups = useMemo(() => parseChatGroups(raw), [raw]);
  const updateGroups = useCallback((update: SetStateAction<ChatGroupsState>) => {
    const current = readChatGroups();
    const next = typeof update === 'function' ? update(current) : update;
    if (next !== current) saveChatGroups(next);
  }, []);
  return [groups, updateGroups];
}
