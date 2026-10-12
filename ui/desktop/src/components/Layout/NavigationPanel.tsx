import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { AudioLines, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigationContext } from './NavigationContext';
import { useConfig } from '../ConfigContext';
import { useNavigationSessions } from '../../hooks/useNavigationSessions';
import {
  NAV_ITEMS,
  SETTINGS_NAV_ITEM,
  getNavItemLabel,
  type NavItem,
} from '../../hooks/useNavigationItems';
import { AppEvents } from '../../constants/events';
import { InlineEditText } from '../common/InlineEditText';
import { SessionIndicators } from '../SessionIndicators';
import { acpRenameSession, type SessionListItem } from '../../acp/sessions';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import { formatMessageTimestamp } from '../../utils/timeUtils';
import { cn } from '../../utils';
import {
  CHAT_GROUPS_STORAGE_KEY,
  assignChatGroup,
  createChatGroup,
  deleteChatGroup,
  groupRecentChats,
  parseChatGroups,
  renameChatGroup,
} from '../../utils/chatGroups';
import { defineMessages, useIntl } from '../../i18n';

type StreamState = 'idle' | 'loading' | 'streaming' | 'error';

interface SessionStatus {
  streamState: StreamState;
  hasUnreadActivity: boolean;
}

const i18n = defineMessages({
  addGroup: { id: 'navigationPanel.addGroup', defaultMessage: 'New chat group' },
  groupName: { id: 'navigationPanel.groupName', defaultMessage: 'Group name' },
  ungrouped: { id: 'navigationPanel.ungrouped', defaultMessage: 'Ungrouped' },
  deleteGroup: { id: 'navigationPanel.deleteGroup', defaultMessage: 'Delete group' },
  confirmDeleteGroup: {
    id: 'navigationPanel.confirmDeleteGroup',
    defaultMessage: 'Delete group “{name}”? Its chats will move to Ungrouped.',
  },
  chats: {
    id: 'navigationPanel.chats',
    defaultMessage: 'Chats',
  },
  noChats: {
    id: 'navigationPanel.noChats',
    defaultMessage: 'No recent chats',
  },
  loadingChats: {
    id: 'navigationPanel.loadingChats',
    defaultMessage: 'Loading chats…',
  },
  untitledSession: {
    id: 'navigationPanel.untitledSession',
    defaultMessage: 'Untitled session',
  },
  metaModel: {
    id: 'navigationPanel.metaModel',
    defaultMessage: 'Model',
  },
  metaDirectory: {
    id: 'navigationPanel.metaDirectory',
    defaultMessage: 'Directory',
  },
  metaStatus: {
    id: 'navigationPanel.metaStatus',
    defaultMessage: 'Status',
  },
  metaCreated: {
    id: 'navigationPanel.metaCreated',
    defaultMessage: 'Created',
  },
  metaUpdated: {
    id: 'navigationPanel.metaUpdated',
    defaultMessage: 'Updated',
  },
  statusStreaming: {
    id: 'navigationPanel.statusStreaming',
    defaultMessage: 'Streaming',
  },
  statusError: {
    id: 'navigationPanel.statusError',
    defaultMessage: 'Error',
  },
  statusUnread: {
    id: 'navigationPanel.statusUnread',
    defaultMessage: 'Unread activity',
  },
  statusIdle: {
    id: 'navigationPanel.statusIdle',
    defaultMessage: 'Idle',
  },
  returnToActiveLiveVoice: {
    id: 'liveVoice.returnToActive',
    defaultMessage: 'Return to active Live voice',
  },
});

const CHAT_SESSION_DRAG_TYPE = 'application/x-goose-chat-session-id';

const navItemClass = (active: boolean) =>
  cn(
    'flex flex-row items-center gap-3 outline-none no-drag w-full',
    'rounded-full px-3 py-2 text-sm font-medium transition-colors',
    active
      ? 'bg-background-tertiary text-text-primary'
      : 'text-text-primary hover:bg-background-tertiary/60'
  );

interface NavRowProps {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}

const NavRow: React.FC<NavRowProps> = ({ item, active, onClick }) => {
  const intl = useIntl();
  const Icon = item.icon;
  return (
    <button onClick={onClick} className={navItemClass(active)}>
      <Icon className="w-5 h-5 flex-shrink-0 text-text-secondary" />
      <span className="text-left flex-1 truncate">{getNavItemLabel(item, intl)}</span>
      {item.getTag && (
        <span className="text-xs font-mono text-text-secondary">{item.getTag()}</span>
      )}
    </button>
  );
};

interface SessionRowProps {
  session: SessionListItem;
  active: boolean;
  isLiveVoiceActive: boolean;
  status: SessionStatus | undefined;
  onClick: () => void;
  onRenamed: () => void;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
}

const formatTimestamp = (value?: string): string | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return formatMessageTimestamp(parsed / 1000);
};

const MetaRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex gap-2">
    <span className="text-text-inverse/60 flex-shrink-0">{label}</span>
    <span className="text-right ml-auto break-all">{value}</span>
  </div>
);

interface SessionTooltipContentProps {
  session: SessionListItem;
  statusLabel: string;
}

const SessionTooltipContent: React.FC<SessionTooltipContentProps> = ({ session, statusLabel }) => {
  const intl = useIntl();
  const model = session.modelId
    ? session.providerId
      ? `${session.modelId} (${session.providerId})`
      : session.modelId
    : session.providerId;
  const created = formatTimestamp(session.createdAt);
  const updated = formatTimestamp(session.lastMessageAt ?? session.updatedAt);

  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="font-medium break-words">
        {session.name || intl.formatMessage(i18n.untitledSession)}
      </div>
      <div className="flex flex-col gap-0.5">
        {model && <MetaRow label={intl.formatMessage(i18n.metaModel)} value={model} />}
        {session.workingDir && (
          <MetaRow label={intl.formatMessage(i18n.metaDirectory)} value={session.workingDir} />
        )}
        <MetaRow label={intl.formatMessage(i18n.metaStatus)} value={statusLabel} />
        {created && <MetaRow label={intl.formatMessage(i18n.metaCreated)} value={created} />}
        {updated && <MetaRow label={intl.formatMessage(i18n.metaUpdated)} value={updated} />}
      </div>
    </div>
  );
};

const SessionRow: React.FC<SessionRowProps> = ({
  session,
  active,
  isLiveVoiceActive,
  status,
  onClick,
  onRenamed,
  onDragStart,
}) => {
  const intl = useIntl();
  const [isEditing, setIsEditing] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const isStreaming = status?.streamState === 'streaming';
  const hasError = status?.streamState === 'error';
  const hasUnread = status?.hasUnreadActivity ?? false;

  const statusLabel = isStreaming
    ? intl.formatMessage(i18n.statusStreaming)
    : hasError
      ? intl.formatMessage(i18n.statusError)
      : hasUnread
        ? intl.formatMessage(i18n.statusUnread)
        : intl.formatMessage(i18n.statusIdle);

  return (
    <Tooltip open={tooltipOpen && !isEditing} onOpenChange={setTooltipOpen} delayDuration={400}>
      <TooltipTrigger asChild>
        <div
          draggable={!isEditing}
          onDragStart={onDragStart}
          onClick={() => !isEditing && onClick()}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer text-sm',
            'hover:bg-background-tertiary/60 transition-colors',
            active && 'bg-background-tertiary'
          )}
        >
          <InlineEditText
            value={session.name}
            onSave={async (newName) => {
              await acpRenameSession(session.id, newName);
              window.dispatchEvent(
                new CustomEvent(AppEvents.SESSION_RENAMED, {
                  detail: { sessionId: session.id, newName, userInitiated: true },
                })
              );
              onRenamed();
            }}
            placeholder={intl.formatMessage(i18n.untitledSession)}
            disabled={isStreaming}
            singleClickEdit={false}
            className="truncate text-text-primary flex-1 !px-0 !py-0 hover:bg-transparent"
            editClassName="!text-sm"
            onEditStart={() => setIsEditing(true)}
            onEditEnd={() => setIsEditing(false)}
          />
          {isLiveVoiceActive && (
            <AudioLines
              className="w-3.5 h-3.5 flex-shrink-0 text-blue-500"
              aria-label={intl.formatMessage(i18n.returnToActiveLiveVoice)}
            />
          )}
          <SessionIndicators isStreaming={isStreaming} hasUnread={hasUnread} hasError={hasError} />
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" align="start" className="max-w-xs text-left">
        <SessionTooltipContent session={session} statusLabel={statusLabel} />
      </TooltipContent>
    </Tooltip>
  );
};

export const Navigation: React.FC<{
  className?: string;
  activeLiveVoiceSessionId: string | null;
}> = ({ className, activeLiveVoiceSessionId }) => {
  const intl = useIntl();
  const { isNavExpanded } = useNavigationContext();
  const location = useLocation();
  const { extensionsList } = useConfig();

  const appsExtensionEnabled = !!extensionsList?.find((ext) => ext.name === 'apps')?.enabled;

  const visibleItems = useMemo<NavItem[]>(() => {
    return NAV_ITEMS.filter((item) => {
      if (item.path === '/apps') return appsExtensionEnabled;
      return true;
    });
  }, [appsExtensionEnabled]);

  const isActive = useCallback((path: string) => location.pathname === path, [location.pathname]);

  const {
    recentSessions,
    isLoadingSessions,
    activeSessionId,
    fetchSessions,
    handleNavClick,
    handleSessionClick,
  } = useNavigationSessions();

  const [sessionStatuses, setSessionStatuses] = useState<Map<string, SessionStatus>>(new Map());

  useEffect(() => {
    const handleStatusUpdate = (event: Event) => {
      const { sessionId, streamState } = (event as CustomEvent).detail;
      setSessionStatuses((prev) => {
        const existing = prev.get(sessionId);
        const shouldMarkUnread = existing?.streamState === 'streaming' && streamState === 'idle';
        const next = new Map(prev);
        next.set(sessionId, {
          streamState,
          hasUnreadActivity: existing?.hasUnreadActivity || shouldMarkUnread,
        });
        return next;
      });
    };

    window.addEventListener(AppEvents.SESSION_STATUS_UPDATE, handleStatusUpdate);
    return () => window.removeEventListener(AppEvents.SESSION_STATUS_UPDATE, handleStatusUpdate);
  }, []);

  const clearUnread = useCallback((sessionId: string) => {
    setSessionStatuses((prev) => {
      const status = prev.get(sessionId);
      if (status?.hasUnreadActivity) {
        const next = new Map(prev);
        next.set(sessionId, { ...status, hasUnreadActivity: false });
        return next;
      }
      return prev;
    });
  }, []);

  const navFocusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isNavExpanded) {
      fetchSessions();
      requestAnimationFrame(() => navFocusRef.current?.focus());
    }
  }, [isNavExpanded, fetchSessions]);

  const [isChatsExpanded, setIsChatsExpanded] = useState(true);
  const [chatGroups, setChatGroups] = useState(() =>
    parseChatGroups(localStorage.getItem(CHAT_GROUPS_STORAGE_KEY))
  );
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const cancelNewGroupRef = useRef(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const recentChatsByGroup = useMemo(
    () => groupRecentChats(recentSessions, chatGroups),
    [recentSessions, chatGroups]
  );

  useEffect(() => {
    localStorage.setItem(CHAT_GROUPS_STORAGE_KEY, JSON.stringify(chatGroups));
  }, [chatGroups]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === CHAT_GROUPS_STORAGE_KEY) setChatGroups(parseChatGroups(event.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const saveNewGroup = () => {
    if (!cancelNewGroupRef.current && newGroupName.trim()) {
      setChatGroups((current) =>
        createChatGroup(current, window.crypto.randomUUID(), newGroupName)
      );
    }
    cancelNewGroupRef.current = true;
    setNewGroupName('');
    setCreatingGroup(false);
  };

  const handleDragStart = (sessionId: string) => (event: React.DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData(CHAT_SESSION_DRAG_TYPE, sessionId);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (groupId: string) => (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes(CHAT_SESSION_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverGroup(groupId);
  };

  const handleDrop = (groupId: string | null) => (event: React.DragEvent) => {
    event.preventDefault();
    setDragOverGroup(null);
    if (!event.dataTransfer.types.includes(CHAT_SESSION_DRAG_TYPE)) return;
    const sessionId = event.dataTransfer.getData(CHAT_SESSION_DRAG_TYPE);
    if (recentSessions.some((session) => session.id === sessionId)) {
      setChatGroups((current) => assignChatGroup(current, sessionId, groupId));
    }
  };

  const renderSession = (session: SessionListItem) => (
    <SessionRow
      key={session.id}
      session={session}
      active={session.id === activeSessionId}
      isLiveVoiceActive={session.id === activeLiveVoiceSessionId}
      status={sessionStatuses.get(session.id)}
      onDragStart={handleDragStart(session.id)}
      onClick={() => {
        clearUnread(session.id);
        handleSessionClick(session.id);
      }}
      onRenamed={fetchSessions}
    />
  );

  if (!isNavExpanded) return null;

  return (
    <motion.div
      ref={navFocusRef}
      tabIndex={-1}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className={cn('bg-background-primary outline-none flex flex-col h-full', className)}
    >
      <div className="h-[48px] no-drag" />

      <div className="px-2 flex flex-col gap-0.5">
        {visibleItems.map((item) => (
          <NavRow
            key={item.id}
            item={item}
            active={isActive(item.path)}
            onClick={() => handleNavClick(item.path)}
          />
        ))}
      </div>

      <div className="flex-1 min-h-0 flex flex-col mt-3">
        <div className="flex items-center">
          <button
            onClick={() => setIsChatsExpanded((v) => !v)}
            aria-expanded={isChatsExpanded}
            className="flex items-center gap-1 pl-4 pr-1 py-1 text-xs font-semibold uppercase tracking-wider text-text-secondary hover:text-text-primary transition-colors"
          >
            {isChatsExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            <span>{intl.formatMessage(i18n.chats)}</span>
          </button>
          <button
            type="button"
            aria-label={intl.formatMessage(i18n.addGroup)}
            title={intl.formatMessage(i18n.addGroup)}
            className="p-1 text-text-secondary hover:text-text-primary"
            onClick={() => {
              cancelNewGroupRef.current = false;
              setIsChatsExpanded(true);
              setCreatingGroup(true);
            }}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {isChatsExpanded && (
          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 mt-1">
            {creatingGroup && (
              <input
                autoFocus
                aria-label={intl.formatMessage(i18n.groupName)}
                placeholder={intl.formatMessage(i18n.groupName)}
                maxLength={200}
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') {
                    cancelNewGroupRef.current = true;
                    event.currentTarget.blur();
                  }
                }}
                onBlur={saveNewGroup}
                className="mx-3 my-1 min-w-0 w-[calc(100%-1.5rem)] rounded border border-border-secondary bg-background-primary px-2 py-1 text-sm text-text-primary"
              />
            )}
            <>
              {recentChatsByGroup.groups.map((group) => (
                <div
                  key={group.id}
                  onDragOver={handleDragOver(group.id)}
                  onDragLeave={() => setDragOverGroup(null)}
                  onDrop={handleDrop(group.id)}
                  className={cn(
                    'rounded-md',
                    dragOverGroup === group.id && 'bg-background-tertiary'
                  )}
                >
                  <div className="flex items-center gap-1 px-2 pt-2 pb-0.5">
                    <button
                      type="button"
                      aria-label={`${group.name} (${group.sessions.length})`}
                      aria-expanded={!collapsedGroups.has(group.id)}
                      onClick={() =>
                        setCollapsedGroups((current) => {
                          const next = new Set(current);
                          if (next.has(group.id)) next.delete(group.id);
                          else next.add(group.id);
                          return next;
                        })
                      }
                      className="text-text-tertiary hover:text-text-secondary"
                    >
                      {collapsedGroups.has(group.id) ? (
                        <ChevronRight className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                    <InlineEditText
                      value={group.name}
                      onSave={async (name) =>
                        setChatGroups((current) => renameChatGroup(current, group.id, name))
                      }
                      singleClickEdit={false}
                      className="min-w-0 flex-1 truncate text-[10px] uppercase tracking-wider text-text-tertiary"
                      editClassName="!text-xs"
                    />
                    <button
                      type="button"
                      title={intl.formatMessage(i18n.deleteGroup)}
                      aria-label={`${intl.formatMessage(i18n.deleteGroup)}: ${group.name}`}
                      className="text-text-tertiary hover:text-text-primary"
                      onClick={() => {
                        if (
                          window.confirm(
                            intl.formatMessage(i18n.confirmDeleteGroup, { name: group.name })
                          )
                        ) {
                          setChatGroups((current) => deleteChatGroup(current, group.id));
                        }
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  {!collapsedGroups.has(group.id) && group.sessions.map(renderSession)}
                </div>
              ))}
              <div
                onDragOver={handleDragOver('ungrouped')}
                onDragLeave={() => setDragOverGroup(null)}
                onDrop={handleDrop(null)}
                className={cn(
                  'rounded-md',
                  dragOverGroup === 'ungrouped' && 'bg-background-tertiary'
                )}
              >
                <div className="px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-wider text-text-tertiary">
                  {intl.formatMessage(i18n.ungrouped)}
                </div>
                {recentChatsByGroup.ungrouped.map(renderSession)}
              </div>
              {recentSessions.length === 0 && (
                <div className="px-3 py-2 text-xs text-text-secondary">
                  {intl.formatMessage(isLoadingSessions ? i18n.loadingChats : i18n.noChats)}
                </div>
              )}
            </>
          </div>
        )}
      </div>

      <div className="px-2 pt-2 pb-2 border-t border-border-secondary">
        <NavRow
          item={SETTINGS_NAV_ITEM}
          active={isActive(SETTINGS_NAV_ITEM.path)}
          onClick={() => handleNavClick(SETTINGS_NAV_ITEM.path)}
        />
      </div>
    </motion.div>
  );
};
