// ─── Statut de match NML par piste (EPIC-016) ──────────────────────────────
// Badge « matché / homonymes / non importé » dans la playlist : permet de voir
// d'un coup d'œil quelles pistes peuvent être sauvegardées dans la collection
// Traktor (cues/loops/grille) vs celles qui sont en visualisation seule.

export type MatchStatus = 'matched' | 'multiple' | 'missing' | 'error';

// Cache de PROMESSES : déduplique les appels concurrents pour un même fullPath
// (un seul fetch), et évite tout état transitoire incohérent.
const _cache = new Map<string, Promise<MatchStatus>>();

export function _clearMatchCache(): void {
  _cache.clear();
}

async function _fetchStatus(fullPath: string): Promise<MatchStatus> {
  try {
    const res = await fetch(`/api/track/match?path=${encodeURIComponent(fullPath)}`);
    if (!res.ok) return 'error';
    const data = (await res.json()) as { ok?: boolean; entries?: unknown[] };
    if (!data.ok || !Array.isArray(data.entries)) return 'error';
    if (data.entries.length === 0) return 'missing';
    return data.entries.length > 1 ? 'multiple' : 'matched';
  } catch {
    return 'error';
  }
}

/**
 * Statut de match d'une piste (lazy, cache par fullPath) :
 * - 'matched'  → une seule entrée NML (sauvegarde des cues possible)
 * - 'multiple' → plusieurs entrées homonymes (sélecteur au clic sur Cues)
 * - 'missing'  → absente de la collection (visualisation seule / ajout possible)
 * - 'error'    → appel API en échec (badge neutre, pas d'alerte)
 */
export function getMatchStatus(fullPath: string): Promise<MatchStatus> {
  const cached = _cache.get(fullPath);
  if (cached) return cached;
  const p = _fetchStatus(fullPath);
  _cache.set(fullPath, p);
  return p;
}

// ── Badge ─────────────────────────────────────────────────────────────────

interface BadgeParts {
  cls: string;
  text: string;
  title: string;
}

const PARTS: Record<string, BadgeParts> = {
  loading: { cls: 'pl-match-loading', text: '…', title: 'Vérification collection…' },
  matched: { cls: 'pl-match-ok', text: '✓ NML', title: 'Dans la collection Traktor — cues sauvegardables' },
  multiple: { cls: 'pl-match-multi', text: '≈ homonymes', title: 'Plusieurs entrées homonymes dans la collection' },
  missing: {
    cls: 'pl-match-missing',
    text: '✕ non importé',
    title: 'Absente de la collection Traktor — visualisation seule',
  },
  error: { cls: 'pl-match-error', text: '?', title: 'Match impossible (erreur réseau/API)' },
};

/** Apparence du badge par statut (classe, texte, infobulle). */
export function matchBadgeParts(status: MatchStatus | undefined): BadgeParts {
  return PARTS[status ?? 'loading'] ?? PARTS.error;
}

/**
 * Badge HTML complet (tests ; ne pas emboîter dans un autre span .pl-track-match —
 * le remplissage en prod passe par matchBadgeParts + mutation in-place).
 */
export function matchBadgeHtml(status: MatchStatus | undefined): string {
  const p = matchBadgeParts(status);
  return `<span class="pl-track-match ${p.cls}" title="${p.title}">${p.text}</span>`;
}
