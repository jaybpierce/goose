import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntlProvider } from 'react-intl';
import { acpListSessions, type SessionListItem } from '../../acp/sessions';
import {
  CHAT_GROUPS_STORAGE_KEY,
  assignChatGroup,
  createChatGroup,
  emptyChatGroups,
  saveChatGroups,
} from '../../utils/chatGroups';
import SessionListView from './SessionListView';

vi.mock('../../acp/sessions', () => ({
  acpListSessions: vi.fn(),
  acpDeleteSession: vi.fn(),
  acpForkSession: vi.fn(),
  acpExportSession: vi.fn(),
  acpImportSession: vi.fn(),
  acpRenameSession: vi.fn(),
}));
vi.mock('../Layout/MainPanelLayout', () => ({
  MainPanelLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../conversation/SearchView', () => ({
  SearchView: ({
    children,
    onSearch,
  }: {
    children: React.ReactNode;
    onSearch: (value: string) => void;
  }) => (
    <div>
      <input aria-label="Search history" onChange={(event) => onSearch(event.target.value)} />
      {children}
    </div>
  ),
}));

const now = new Date();
const yesterday = new Date(now);
yesterday.setDate(yesterday.getDate() - 1);
const session = (
  id: string,
  workingDir: string,
  updatedAt = now.toISOString(),
  sessionType?: SessionListItem['sessionType']
): SessionListItem => ({
  id,
  name: id,
  workingDir,
  updatedAt,
  createdAt: updatedAt,
  messageCount: 1,
  sessionType,
});
const older = session('Older chat', '/original/older', yesterday.toISOString());
const recent = session('Recent chat', '/original/recent');
const scheduled = session('Scheduled chat', '/scheduled', now.toISOString(), 'scheduled');

function mount() {
  const onSelectSession = vi.fn();
  const view = render(
    <IntlProvider locale="en">
      <SessionListView onSelectSession={onSelectSession} />
    </IntlProvider>
  );
  return { ...view, onSelectSession };
}

function transfer() {
  const data = new Map<string, string>();
  return {
    types: ['application/x-goose-chat-session-id'],
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? '',
    effectAllowed: 'none',
    dropEffect: 'none',
  };
}

describe('SessionListView chat groups', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(acpListSessions).mockReset();
  });

  it('shows persisted groups across paginated history, with dates and scheduled sessions kept separate', async () => {
    saveChatGroups(
      assignChatGroup(createChatGroup(emptyChatGroups(), 'work', 'Work'), older.id, 'work')
    );
    vi.mocked(acpListSessions).mockImplementation(async (cursor) =>
      cursor
        ? { sessions: [older], nextCursor: null }
        : { sessions: [recent, scheduled], nextCursor: 'page-2' }
    );
    const { onSelectSession } = mount();

    const work = await screen.findByRole('region', { name: 'Work' });
    expect(await within(work).findByText('Older chat')).toBeInTheDocument();
    expect(within(work).getByText('Yesterday')).toBeInTheDocument();
    const ungrouped = screen.getByRole('region', { name: 'Ungrouped' });
    expect(within(ungrouped).getByText('Recent chat')).toBeInTheDocument();
    expect(within(ungrouped).getByText('Today')).toBeInTheDocument();
    expect(within(work).queryByText('Scheduled chat')).not.toBeInTheDocument();
    expect(within(ungrouped).queryByText('Scheduled chat')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Scheduled Jobs/ }));
    expect(screen.getByText('Scheduled chat')).toBeInTheDocument();
    expect(screen.getByText('Scheduled chat').closest('[draggable]')).toHaveAttribute(
      'draggable',
      'false'
    );
    fireEvent.click(within(work).getByText('Older chat'));
    expect(onSelectSession).toHaveBeenCalledWith(older.id);
    expect(older.workingDir).toBe('/original/older');
    fireEvent.click(within(work).getByRole('button', { name: 'Work' }));
    expect(within(work).queryByText('Older chat')).not.toBeInTheDocument();
    expect(screen.getByText('Scheduled chat')).toBeInTheDocument();
    fireEvent.click(within(work).getByRole('button', { name: 'Work' }));
    expect(within(work).getByText('Older chat')).toBeInTheDocument();
  });

  it('moves an older history card into a sidebar group and back to Ungrouped without changing cwd', async () => {
    saveChatGroups(createChatGroup(emptyChatGroups(), 'work', 'Work'));
    vi.mocked(acpListSessions).mockResolvedValue({ sessions: [older, recent], nextCursor: null });
    const { onSelectSession, unmount } = mount();
    const work = await screen.findByRole('region', { name: 'Work' });
    const ungrouped = screen.getByRole('region', { name: 'Ungrouped' });
    await within(ungrouped).findByText('Older chat');

    const drag = transfer();
    fireEvent.dragStart(within(ungrouped).getByText('Older chat').closest('[draggable]')!, {
      dataTransfer: drag,
    });
    fireEvent.dragOver(work, { dataTransfer: drag });
    fireEvent.drop(work, { dataTransfer: drag });
    expect(within(work).getByText('Older chat')).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem(CHAT_GROUPS_STORAGE_KEY)!).sessionGroupIds[older.id]
    ).toBe('work');
    expect(onSelectSession).not.toHaveBeenCalled();

    unmount();
    mount();
    const restored = await screen.findByRole('region', { name: 'Work' });
    await within(restored).findByText('Older chat');
    const move = transfer();
    fireEvent.dragStart(within(restored).getByText('Older chat').closest('[draggable]')!, {
      dataTransfer: move,
    });
    fireEvent.drop(screen.getByRole('region', { name: 'Ungrouped' }), { dataTransfer: move });
    expect(
      within(screen.getByRole('region', { name: 'Ungrouped' })).getByText('Older chat')
    ).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem(CHAT_GROUPS_STORAGE_KEY)!).sessionGroupIds[older.id]
    ).toBeUndefined();
    expect([older, recent].map((s) => s.workingDir)).toEqual([
      '/original/older',
      '/original/recent',
    ]);
  });

  it('keeps the matching session in its saved group when searching history', async () => {
    saveChatGroups(
      assignChatGroup(createChatGroup(emptyChatGroups(), 'work', 'Work'), older.id, 'work')
    );
    vi.mocked(acpListSessions).mockImplementation(async (_, filter) => ({
      sessions: filter?.keyword ? [older] : [older, recent],
      nextCursor: null,
    }));
    mount();
    const work = await screen.findByRole('region', { name: 'Work' });
    await within(work).findByText('Older chat');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search history' }), {
      target: { value: 'Older' },
    });
    await waitFor(() =>
      expect(acpListSessions).toHaveBeenCalledWith(undefined, {
        keyword: 'Older',
        includeAcp: false,
      })
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Ungrouped' })).queryByText('Recent chat')
      ).not.toBeInTheDocument()
    );
    expect(within(work).getByText('Older chat')).toBeInTheDocument();
  });

  it('shows empty saved groups as drop targets without pretending scheduled sessions are ungrouped', async () => {
    saveChatGroups(createChatGroup(emptyChatGroups(), 'work', 'Work'));
    vi.mocked(acpListSessions).mockResolvedValue({ sessions: [scheduled], nextCursor: null });
    mount();
    await screen.findByRole('region', { name: 'Work' });
    await screen.findByText('No chat sessions found');
    expect(screen.queryByRole('region', { name: 'Ungrouped' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Scheduled Jobs/ }));
    expect(screen.getByText('Scheduled chat')).toBeInTheDocument();
  });

  it('updates when sidebar groups are renamed or reassigned and ignores unrelated drops', async () => {
    saveChatGroups(createChatGroup(emptyChatGroups(), 'work', 'Work'));
    vi.mocked(acpListSessions).mockResolvedValue({ sessions: [older], nextCursor: null });
    mount();
    const ungrouped = await screen.findByRole('region', { name: 'Ungrouped' });
    await within(ungrouped).findByText('Older chat');

    saveChatGroups({
      groups: [{ id: 'work', name: 'Renamed' }],
      sessionGroupIds: { [older.id]: 'work' },
    });
    expect(
      within(await screen.findByRole('region', { name: 'Renamed' })).getByText('Older chat')
    ).toBeInTheDocument();

    const foreign = { types: ['text/plain'], getData: () => older.id };
    fireEvent.drop(screen.getByRole('region', { name: 'Ungrouped' }), { dataTransfer: foreign });
    expect(
      within(screen.getByRole('region', { name: 'Renamed' })).getByText('Older chat')
    ).toBeInTheDocument();

    saveChatGroups(emptyChatGroups());
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Ungrouped' })).getByText('Older chat')
      ).toBeInTheDocument()
    );
    expect(screen.queryByRole('region', { name: 'Renamed' })).not.toBeInTheDocument();
  });
});
