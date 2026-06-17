/**
 * Merge spreadsheet shorthand names with email identities for the same person.
 * Each group canonicalizes to the email form when present.
 *
 * Site-specific aliases are NOT committed to source. Configure them via the
 * PERSON_ALIASES environment variable as a JSON array of alias groups:
 *   PERSON_ALIASES=[["phil g","philg@vrsinc","philg@vrs-inc.com"],["ted h","tedh","tedh@vrs-inc.com"]]
 */
function loadEnvAliases(): readonly (readonly string[])[] {
  const raw = process.env.PERSON_ALIASES;
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[]).filter(
      (g): g is string[] =>
        Array.isArray(g) && (g as unknown[]).every((s) => typeof s === 'string'),
    );
  } catch {
    return [];
  }
}

const ALIAS_GROUPS: readonly (readonly string[])[] = loadEnvAliases();

const CANONICAL_BY_KEY = new Map<string, string>();

for (const group of ALIAS_GROUPS) {
  const canonical =
    group.find((alias) => alias.includes('@'))?.trim().toLowerCase() ??
    group[group.length - 1].trim().toLowerCase();
  for (const alias of group) {
    CANONICAL_BY_KEY.set(alias.trim().toLowerCase(), canonical);
  }
}

export function normalizePersonKey(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase();
}

export function canonicalPersonName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '';
  const key = normalizePersonKey(trimmed);
  return CANONICAL_BY_KEY.get(key) ?? key;
}

export function samePerson(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const ak = normalizePersonKey(a);
  const bk = normalizePersonKey(b);
  if (!ak || !bk) return false;
  return canonicalPersonName(a) === canonicalPersonName(b);
}
