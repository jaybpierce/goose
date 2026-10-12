import fs from 'node:fs';
import path from 'node:path';

export function isUsableLocalDirectory(directory: string): boolean {
  if (!path.isAbsolute(directory)) return false;
  try {
    const stats = fs.lstatSync(directory);
    if (!stats.isDirectory() || stats.isSymbolicLink()) return false;
    fs.accessSync(directory, fs.constants.R_OK | fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function selectNewSessionDirectory(
  requested: string | undefined | null,
  preferred: string,
  recent: string[],
  home: string,
  isUsable: (directory: string) => boolean = isUsableLocalDirectory
): { directory: string; invalidPreference: boolean } {
  if (requested?.trim()) return { directory: requested, invalidPreference: false };
  const preference = typeof preferred === 'string' ? preferred.trim() : '';
  if (preference && isUsable(preference)) {
    return { directory: preference, invalidPreference: false };
  }
  return {
    directory: recent.find(isUsable) ?? home,
    invalidPreference: !!preference,
  };
}
