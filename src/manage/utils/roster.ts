/** Preserve repeated names: each nonempty line represents a separate person. */
export function parseRosterNames(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function hasDuplicateRosterNames(
  names: string[],
  existingNames: string[],
): boolean {
  const normalize = (name: string) =>
    name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
  const normalized = names.map(normalize);
  return (
    new Set(normalized).size !== normalized.length ||
    existingNames.some((name) => normalized.includes(normalize(name)))
  );
}
