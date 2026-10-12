import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getDefaultNewSessionWorkingDir,
  getEffectiveWorkingDir,
  resolveWorkingDir,
} from '../workingDir';

describe('resolveWorkingDir', () => {
  it('uses the configured external backend directory when present', () => {
    expect(resolveWorkingDir(' /home/goose ', 'C:\\Users\\goose', 'C:\\Users\\goose')).toBe(
      '/home/goose'
    );
    expect(resolveWorkingDir(' ', 'C:\\work', 'C:\\Users\\goose')).toBe('C:\\work');
    expect(resolveWorkingDir(undefined, undefined, 'C:\\Users\\goose')).toBe('C:\\Users\\goose');
  });
});

describe('getEffectiveWorkingDir', () => {
  const getSettingMock = vi.fn();
  const appConfigGetMock = vi.fn();
  const resolveDefaultMock = vi.fn();

  const mockWindow = (externalBackend: boolean, boundUrl: string, source = 'settings') => {
    appConfigGetMock.mockImplementation((key: string) => {
      if (key === 'GOOSE_EXTERNAL_BACKEND') return externalBackend;
      if (key === 'GOOSE_EXTERNAL_BACKEND_URL') return boundUrl;
      if (key === 'GOOSE_EXTERNAL_BACKEND_SOURCE') return source;
      if (key === 'GOOSE_WORKING_DIR') return '/Users/johannes/home/workspace';
      return undefined;
    });
  };

  beforeEach(() => {
    getSettingMock.mockReset();
    appConfigGetMock.mockReset();
    resolveDefaultMock.mockReset();
    resolveDefaultMock.mockResolvedValue('/Users/johannes/default');
    (globalThis as Record<string, unknown>).window = {
      appConfig: { get: appConfigGetMock },
      electron: {
        getSetting: getSettingMock,
        resolveDefaultNewSessionDirectory: resolveDefaultMock,
      },
    } as unknown as typeof globalThis;
  });

  it('resolves a fresh chat through the persisted local default', async () => {
    mockWindow(false, '');
    await expect(getDefaultNewSessionWorkingDir()).resolves.toBe('/Users/johannes/default');
    expect(resolveDefaultMock).toHaveBeenCalledWith('/Users/johannes/home/workspace');
  });

  it('keeps explicit window selection instead of the saved default', async () => {
    mockWindow(false, '');
    appConfigGetMock.mockImplementation((key: string) =>
      key === 'GOOSE_WORKING_DIR' ? '/chosen' : key === 'REQUEST_DIR' ? '/chosen' : undefined
    );
    await expect(getDefaultNewSessionWorkingDir()).resolves.toBe('/chosen');
    expect(resolveDefaultMock).not.toHaveBeenCalled();
  });

  it('lets a Quick Launcher chat ignore a directory chosen for its target window', async () => {
    mockWindow(false, '');
    appConfigGetMock.mockImplementation((key: string) =>
      key === 'GOOSE_WORKING_DIR' ? '/chosen' : key === 'REQUEST_DIR' ? '/chosen' : undefined
    );
    await expect(getDefaultNewSessionWorkingDir(true)).resolves.toBe('/Users/johannes/default');
    expect(resolveDefaultMock).toHaveBeenCalledWith('/chosen');
  });

  it('preserves remote backend precedence over a local default', async () => {
    mockWindow(true, 'http://remote:3000');
    getSettingMock.mockResolvedValue({
      enabled: true,
      url: 'http://remote:3000',
      workingDir: '/remote/workspace',
    });
    await expect(getDefaultNewSessionWorkingDir()).resolves.toBe('/remote/workspace');
    expect(resolveDefaultMock).not.toHaveBeenCalled();
  });

  it('keeps an external backend window directory when no remote directory is configured', async () => {
    mockWindow(true, 'http://remote:3000');
    getSettingMock.mockResolvedValue({ enabled: true, url: 'http://remote:3000', workingDir: '' });
    await expect(getDefaultNewSessionWorkingDir()).resolves.toBe('/Users/johannes/home/workspace');
    expect(resolveDefaultMock).not.toHaveBeenCalled();
  });

  it('prefers the configured remote directory when bound to the matching external backend', async () => {
    mockWindow(true, 'http://remote:3000/');
    getSettingMock.mockResolvedValue({
      enabled: true,
      url: 'http://remote:3000',
      workingDir: ' /home/goose/workspace ',
    });
    await expect(getEffectiveWorkingDir()).resolves.toBe('/home/goose/workspace');
  });

  it('honors the configured remote directory for env-mode backends regardless of enabled/url', async () => {
    mockWindow(true, 'http://env-backend:3000', 'env');
    getSettingMock.mockResolvedValue({
      enabled: false,
      url: 'http://unrelated:4000',
      workingDir: '/home/goose/workspace',
    });
    await expect(getEffectiveWorkingDir()).resolves.toBe('/home/goose/workspace');
  });

  it('falls back to the remembered directory for env-mode backends without a configured dir', async () => {
    mockWindow(true, 'http://env-backend:3000', 'env');
    getSettingMock.mockResolvedValue({ enabled: false, workingDir: '   ' });
    await expect(getEffectiveWorkingDir()).resolves.toBe('/Users/johannes/home/workspace');
  });

  it('ignores the remote directory when the window is bound to the local backend', async () => {
    mockWindow(false, '');
    getSettingMock.mockResolvedValue({ enabled: true, workingDir: '/home/goose/workspace' });
    await expect(getEffectiveWorkingDir()).resolves.toBe('/Users/johannes/home/workspace');
  });

  it('falls back to the remembered directory when the bound backend no longer matches settings', async () => {
    mockWindow(true, 'http://server-a:3000');
    getSettingMock.mockResolvedValue({
      enabled: true,
      url: 'http://server-b:3000',
      workingDir: '/home/goose/workspace',
    });
    await expect(getEffectiveWorkingDir()).resolves.toBe('/Users/johannes/home/workspace');
  });

  it('falls back to the remembered directory when the external backend is disabled', async () => {
    mockWindow(true, 'http://remote:3000');
    getSettingMock.mockResolvedValue({ enabled: false, workingDir: '/home/goose/workspace' });
    await expect(getEffectiveWorkingDir()).resolves.toBe('/Users/johannes/home/workspace');
  });

  it('falls back to the remembered directory when the remote directory is blank', async () => {
    mockWindow(true, 'http://remote:3000');
    getSettingMock.mockResolvedValue({ enabled: true, workingDir: '   ' });
    await expect(getEffectiveWorkingDir()).resolves.toBe('/Users/johannes/home/workspace');
  });

  it('falls back to the remembered directory when the setting cannot be read', async () => {
    mockWindow(true, 'http://remote:3000');
    getSettingMock.mockRejectedValue(new Error('settings unavailable'));
    await expect(getEffectiveWorkingDir()).resolves.toBe('/Users/johannes/home/workspace');
  });
});
