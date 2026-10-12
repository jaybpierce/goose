import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { isUsableLocalDirectory, selectNewSessionDirectory } from '../defaultNewSessionDirectory';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'goose-default-dir-'));
const preferred = path.join(root, 'preferred');
const recent = path.join(root, 'recent');
const file = path.join(root, 'file');
const symlink = path.join(root, 'link');
fs.mkdirSync(preferred);
fs.mkdirSync(recent);
fs.writeFileSync(file, 'x');
fs.symlinkSync(preferred, symlink);

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('default new-session directory', () => {
  it('accepts real local directories, not files, symlinks or missing paths', () => {
    expect(isUsableLocalDirectory(preferred)).toBe(true);
    expect(isUsableLocalDirectory(file)).toBe(false);
    expect(isUsableLocalDirectory(symlink)).toBe(false);
    expect(isUsableLocalDirectory(path.join(root, 'missing'))).toBe(false);
    expect(isUsableLocalDirectory('relative')).toBe(false);
  });

  it('prefers an explicitly requested directory over the saved default', () => {
    expect(selectNewSessionDirectory('/explicit', preferred, [recent], root)).toEqual({
      directory: '/explicit',
      invalidPreference: false,
    });
  });

  it('uses the configured default when available', () => {
    expect(selectNewSessionDirectory(undefined, preferred, [recent], root)).toEqual({
      directory: preferred,
      invalidPreference: false,
    });
  });

  it('keeps the previous recent-or-home fallback when preference is empty', () => {
    expect(selectNewSessionDirectory(undefined, '', [recent], root).directory).toBe(recent);
    expect(selectNewSessionDirectory(undefined, '', [], root).directory).toBe(root);
  });

  it('falls back safely and reports an unavailable preference', () => {
    const missing = path.join(root, 'missing');
    expect(selectNewSessionDirectory(undefined, missing, [file, recent], root)).toEqual({
      directory: recent,
      invalidPreference: true,
    });
    expect(selectNewSessionDirectory(undefined, symlink, [], root)).toEqual({
      directory: root,
      invalidPreference: true,
    });
  });
});
