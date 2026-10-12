import { describe, expect, it } from 'vitest';
import type { SessionListItem } from '../acp/sessions';
import {
  assignChatGroup,
  createChatGroup,
  deleteChatGroup,
  emptyChatGroups,
  groupRecentChats,
  parseChatGroups,
  renameChatGroup,
} from './chatGroups';

const session = (id: string, workingDir: string): SessionListItem => ({
  id,
  workingDir,
  name: id,
  updatedAt: '',
  createdAt: '',
  messageCount: 0,
});

describe('desktop chat groups', () => {
  it('creates flat named groups and rejects empty/duplicate IDs', () => {
    const created = createChatGroup(emptyChatGroups(), 'one', '  Work  ');
    expect(created.groups).toEqual([{ id: 'one', name: 'Work' }]);
    expect(createChatGroup(created, 'one', 'Other')).toBe(created);
    expect(createChatGroup(created, 'two', '  ')).toBe(created);
  });

  it('assigns via the same operation used by drop and moves a chat between groups and Ungrouped without changing cwd', () => {
    const chats = [session('a', '/one'), session('b', '/one'), session('c', '/two')];
    const base = createChatGroup(
      createChatGroup(emptyChatGroups(), 'one', 'Work'),
      'two',
      'Personal'
    );
    const inWork = assignChatGroup(base, 'a', 'one');
    const moved = assignChatGroup(inWork, 'a', 'two');
    expect(groupRecentChats(chats, moved).groups.map((g) => g.sessions.map((s) => s.id))).toEqual([
      [],
      ['a'],
    ]);
    expect(groupRecentChats(chats, moved).ungrouped.map((s) => s.id)).toEqual(['b', 'c']);
    expect(chats.map((s) => s.workingDir)).toEqual(['/one', '/one', '/two']);
    expect(assignChatGroup(moved, 'a', null).sessionGroupIds).toEqual({});
    expect(assignChatGroup(moved, 'a', 'unknown')).toBe(moved);
  });

  it('restores group membership across app restart, renames and deletes without removing sessions', () => {
    const chats = [session('a', '/one')];
    const saved = JSON.stringify(
      assignChatGroup(createChatGroup(emptyChatGroups(), 'one', 'Work'), 'a', 'one')
    );
    const restored = parseChatGroups(saved);
    expect(groupRecentChats(chats, restored).groups[0].sessions).toEqual(chats);
    const renamed = renameChatGroup(restored, 'one', '  New name ');
    expect(renamed.groups[0].name).toBe('New name');
    expect(renamed.sessionGroupIds.a).toBe('one');
    const deleted = deleteChatGroup(renamed, 'one');
    expect(deleted.groups).toEqual([]);
    expect(groupRecentChats(chats, deleted).ungrouped).toEqual(chats);
    expect(deleted.sessionGroupIds).toEqual({});
  });

  it('recovers from corrupt storage and discards assignments to deleted groups', () => {
    expect(parseChatGroups('{')).toEqual(emptyChatGroups());
    expect(
      parseChatGroups(
        JSON.stringify({ groups: [{ id: 'one', name: 'Work' }], sessionGroupIds: { a: 'other' } })
      )
    ).toEqual({ groups: [{ id: 'one', name: 'Work' }], sessionGroupIds: {} });
  });
});
