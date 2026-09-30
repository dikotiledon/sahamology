const KNOWN_FAULTS = new Set(['stockbit-timeout', 'stockbit-429']);

let current: Set<string> | null = null;

function faultsAllowed(): boolean {
  if (process.env.SAHAMOLOGY_FAULT_ALLOW === '1') return true;
  return process.env.NODE_ENV !== 'production';
}

function parseEnvFaults(): Set<string> {
  if (!faultsAllowed()) return new Set();
  const out = new Set<string>();
  for (const part of (process.env.SAHAMOLOGY_FAULT ?? '').split(',')) {
    const name = part.trim();
    if (KNOWN_FAULTS.has(name)) out.add(name);
  }
  return out;
}

export function resetFaults(): void {
  current = parseEnvFaults();
}

function ensure(): Set<string> {
  if (current === null) current = parseEnvFaults();
  return current;
}

export function activeFaults(): Set<string> {
  return ensure();
}

export function consumeFault(name: string): boolean {
  const set = ensure();
  if (!set.has(name)) return false;
  set.delete(name);
  return true;
}
