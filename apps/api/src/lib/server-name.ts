function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

export function resolveUniqueServerName(name: string, existingNames: Iterable<string>, maxLength = 40): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Server name must contain at least one non-space character.");
  }

  const normalizedExisting = new Set<string>();
  for (const existing of existingNames) {
    const normalized = normalizeName(existing);
    if (normalized) {
      normalizedExisting.add(normalized);
    }
  }

  if (!normalizedExisting.has(normalizeName(trimmed))) {
    return trimmed;
  }

  for (let sequence = 2; sequence <= 9999; sequence += 1) {
    const suffix = `-${sequence}`;
    const maxBaseLength = Math.max(1, maxLength - suffix.length);
    const base = trimmed.slice(0, maxBaseLength).trimEnd();
    const candidate = `${base || "Server"}${suffix}`;
    if (!normalizedExisting.has(normalizeName(candidate))) {
      return candidate;
    }
  }

  throw new Error("Unable to generate a unique server name. Please choose a different name.");
}
