import { useEffect, useState } from 'react';
import { defineMessages, useIntl } from '../../../i18n';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';

const i18n = defineMessages({
  label: {
    id: 'settings.defaultDirectory.label',
    defaultMessage: 'Default new-session directory',
  },
  description: {
    id: 'settings.defaultDirectory.description',
    defaultMessage:
      'Used for new chats and windows unless you choose a directory. Chats started in a window where you chose a directory keep that choice. Remote backend directories and resumed sessions are unchanged. Leave empty to use the recent directory.',
  },
  placeholder: {
    id: 'settings.defaultDirectory.placeholder',
    defaultMessage: 'Absolute local folder path (optional)',
  },
  choose: { id: 'settings.defaultDirectory.choose', defaultMessage: 'Choose folder' },
  save: { id: 'settings.defaultDirectory.save', defaultMessage: 'Save' },
  clear: { id: 'settings.defaultDirectory.clear', defaultMessage: 'Clear' },
  invalid: {
    id: 'settings.defaultDirectory.invalid',
    defaultMessage:
      'Choose an existing, accessible local directory (not a symlink). If a saved folder later becomes unavailable, goose will use a recent folder or your home directory.',
  },
  saveFailed: {
    id: 'settings.defaultDirectory.saveFailed',
    defaultMessage: 'Could not save the directory. Please try again.',
  },
});

export default function DefaultDirectorySection() {
  const intl = useIntl();
  const [directory, setDirectory] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void window.electron.getSetting('defaultNewSessionDirectory').then((value) => {
      if (active) setDirectory(value);
    });
    return () => {
      active = false;
    };
  }, []);

  const save = async (value: string) => {
    const next = value.trim();
    setSaving(true);
    try {
      if (next && !(await window.electron.checkLocalDirectory(next))) {
        setError(intl.formatMessage(i18n.invalid));
        return;
      }
      await window.electron.setSetting('defaultNewSessionDirectory', next);
      setDirectory(next);
      setError('');
    } catch {
      setError(intl.formatMessage(i18n.saveFailed));
    } finally {
      setSaving(false);
    }
  };

  const choose = async () => {
    try {
      const selection = await window.electron.directoryChooser();
      if (!selection.canceled && selection.filePaths[0]) {
        setDirectory(selection.filePaths[0]);
        setError('');
        await save(selection.filePaths[0]);
      }
    } catch {
      setError(intl.formatMessage(i18n.saveFailed));
    }
  };

  return (
    <div className="space-y-2 px-2 py-3">
      <label htmlFor="default-new-session-directory" className="text-sm text-text-primary">
        {intl.formatMessage(i18n.label)}
      </label>
      <p className="text-xs text-text-secondary">{intl.formatMessage(i18n.description)}</p>
      <div className="flex flex-wrap gap-2">
        <Input
          id="default-new-session-directory"
          className="min-w-48 flex-1"
          value={directory}
          placeholder={intl.formatMessage(i18n.placeholder)}
          onChange={(event) => {
            setDirectory(event.target.value);
            setError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void save(directory);
          }}
        />
        <Button type="button" variant="secondary" onClick={() => void choose()} disabled={saving}>
          {intl.formatMessage(i18n.choose)}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void save(directory)}
          disabled={saving}
        >
          {intl.formatMessage(i18n.save)}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void save('')} disabled={saving}>
          {intl.formatMessage(i18n.clear)}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
