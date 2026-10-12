import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntlProvider } from 'react-intl';
import { Navigation } from './NavigationPanel';
import { CHAT_GROUPS_STORAGE_KEY } from '../../utils/chatGroups';
import type { SessionListItem } from '../../acp/sessions';

const sessions: SessionListItem[] = [
  {
    id: 'session-a',
    name: 'Alpha',
    workingDir: '/original/a',
    createdAt: '',
    updatedAt: '',
    messageCount: 1,
  },
  {
    id: 'session-b',
    name: 'Beta',
    workingDir: '/original/b',
    createdAt: '',
    updatedAt: '',
    messageCount: 1,
  },
];
const onSessionClick = vi.fn();
const onFetch = vi.fn();

vi.mock('./NavigationContext', () => ({ useNavigationContext: () => ({ isNavExpanded: true }) }));
vi.mock('../ConfigContext', () => ({ useConfig: () => ({ extensionsList: [] }) }));
vi.mock('react-router', () => ({ useLocation: () => ({ pathname: '/' }) }));
vi.mock('../../hooks/useNavigationSessions', () => ({
  useNavigationSessions: () => ({
    recentSessions: sessions,
    isLoadingSessions: false,
    activeSessionId: undefined,
    fetchSessions: onFetch,
    handleNavClick: vi.fn(),
    handleSessionClick: onSessionClick,
  }),
}));
vi.mock('../../acp/sessions', () => ({ acpRenameSession: vi.fn() }));
vi.mock('../ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}));

function mount() {
  return render(
    <IntlProvider locale="en">
      <Navigation activeLiveVoiceSessionId={null} />
    </IntlProvider>
  );
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

describe('Navigation chat groups', () => {
  beforeEach(() => {
    localStorage.clear();
    onSessionClick.mockClear();
    onFetch.mockClear();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    );
  });

  it('creates, drops across groups and Ungrouped, persists after remount, renames and deletes without touching working directories', async () => {
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: 'New chat group' }));
    const input = screen.getByRole('textbox', { name: 'Group name' });
    fireEvent.change(input, { target: { value: 'Work' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const work = screen.getByRole('button', { name: 'Work (0)' }).parentElement?.parentElement;
    expect(work).toBeTruthy();

    const drag = transfer();
    fireEvent.dragStart(screen.getByText('Alpha').closest('[draggable]')!, { dataTransfer: drag });
    fireEvent.dragOver(work!, { dataTransfer: drag });
    fireEvent.drop(work!, { dataTransfer: drag });
    expect(screen.getByRole('button', { name: 'Work (1)' })).toBeInTheDocument();
    expect(within(work as HTMLElement).getByText('Alpha')).toBeInTheDocument();
    expect(sessions.map((session) => session.workingDir)).toEqual(['/original/a', '/original/b']);
    expect(onSessionClick).not.toHaveBeenCalled();
    expect(
      JSON.parse(localStorage.getItem(CHAT_GROUPS_STORAGE_KEY)!).sessionGroupIds['session-a']
    ).toBeTruthy();

    view.unmount();
    mount();
    expect(screen.getByRole('button', { name: 'Work (1)' })).toBeInTheDocument();
    const groupName = screen.getByText('Work');
    fireEvent.doubleClick(groupName);
    const renameInput = screen.getByDisplayValue('Work');
    fireEvent.change(renameInput, { target: { value: 'New name' } });
    fireEvent.keyDown(renameInput, { key: 'Enter' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'New name (1)' })).toBeInTheDocument()
    );

    const ungrouped = screen.getByText('Ungrouped').parentElement!;
    const move = transfer();
    fireEvent.dragStart(screen.getByText('Alpha').closest('[draggable]')!, { dataTransfer: move });
    fireEvent.dragOver(ungrouped, { dataTransfer: move });
    fireEvent.drop(ungrouped, { dataTransfer: move });
    expect(within(ungrouped).getByText('Alpha')).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem(CHAT_GROUPS_STORAGE_KEY)!).sessionGroupIds['session-a']
    ).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'New chat group' }));
    const secondName = screen.getByRole('textbox', { name: 'Group name' });
    fireEvent.change(secondName, { target: { value: 'Second' } });
    fireEvent.keyDown(secondName, { key: 'Enter' });
    const second = screen.getByRole('button', { name: 'Second (0)' }).parentElement?.parentElement;
    const toSecond = transfer();
    fireEvent.dragStart(screen.getByText('Alpha').closest('[draggable]')!, {
      dataTransfer: toSecond,
    });
    fireEvent.dragOver(second!, { dataTransfer: toSecond });
    fireEvent.drop(second!, { dataTransfer: toSecond });
    expect(screen.getByRole('button', { name: 'Second (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New name (0)' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete group: Second' }));
    expect(
      within(screen.getByText('Ungrouped').parentElement!).getByText('Alpha')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete group: New name' }));
    expect(screen.queryByRole('button', { name: 'New name (0)' })).not.toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(sessions.map((session) => session.workingDir)).toEqual(['/original/a', '/original/b']);
  });

  it('cancels new group creation on Escape and does not accept unrelated drops', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'New chat group' }));
    const name = screen.getByRole('textbox', { name: 'Group name' });
    fireEvent.change(name, { target: { value: 'Not saved' } });
    fireEvent.keyDown(name, { key: 'Escape' });
    expect(screen.queryByText('Not saved')).not.toBeInTheDocument();
    expect(localStorage.getItem(CHAT_GROUPS_STORAGE_KEY)).toBeNull();
    const external = { types: ['text/plain'], getData: () => 'session-a' };
    const ungrouped = screen.getByText('Ungrouped').parentElement!;
    fireEvent.dragOver(ungrouped, { dataTransfer: external });
    fireEvent.drop(ungrouped, { dataTransfer: external });
    expect(localStorage.getItem(CHAT_GROUPS_STORAGE_KEY)).toBeNull();
  });
});
