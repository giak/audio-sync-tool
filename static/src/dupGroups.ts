// ─── Groupes de versions (EPIC-028 v2) : au-delà des paires ───────────────
// Un groupe = tous les exemplaires d'un même morceau (épars ET/OU rangés),
// clusterisés par durée ±2 s + similarité de nom (transitivité via union-find).
// Arbitrage : le meilleur score qualité survit, les perdants sont proposés au
// trash — aucune action automatique, toujours une revue humaine.

import { nameSimilarity, normalizeName, qualityScore } from './dupDetect.js';

export interface GroupMember {
  side: 'epars' | 'source';
  fullPath: string;
  filename: string;
  dir: string;
  duration: number | null;
  codec: string | null;
  score: number;
}

export interface VersionGroup {
  /** Représentant stable : le membre au chemin le plus petit (tri déterministe). */
  key: string;
  members: GroupMember[];
  /** Gagnant arbitré (meilleur score, tie-break durée puis chemin). */
  winner: GroupMember;
  /** Perdants proposés au trash (jamais automatique — revue obligatoire). */
  losers: GroupMember[];
  /** Le gagnant est-il côté épars → plan = copier vers le dossier du meilleur rangé. */
  winnerNeedsCopy: boolean;
  /** Dossier où copier le gagnant épars (dossier du meilleur rangé), sinon null. */
  copyTargetDir: string | null;
}

const DURATION_TOLERANCE = 2;

// ── Clusterisation ────────────────────────────────────────────────────────

interface Node {
  member: GroupMember;
  norm: string;
  parent: number;
}

function find(nodes: Node[], i: number): number {
  while (nodes[i].parent !== i) {
    nodes[i].parent = nodes[nodes[i].parent].parent; // compression de chemin
    i = nodes[i].parent;
  }
  return i;
}

function union(nodes: Node[], a: number, b: number): void {
  const ra = find(nodes, a);
  const rb = find(nodes, b);
  if (ra !== rb) nodes[ra].parent = rb;
}

function collectMembers(
  eparsFiles: Record<string, Record<string, { path: string; duration?: number | null; codec?: string | null }>>,
  sourceFiles: Record<string, Record<string, { path: string; duration?: number | null; codec?: string | null }>>,
): GroupMember[] {
  const members: GroupMember[] = [];
  for (const [dir, files] of Object.entries(eparsFiles)) {
    for (const [filename, data] of Object.entries(files)) {
      members.push({
        side: 'epars',
        fullPath: `${dir}/${data.path}`,
        filename,
        dir,
        duration: data.duration ?? null,
        codec: data.codec ?? null,
        score: 0,
      });
    }
  }
  for (const [dir, files] of Object.entries(sourceFiles)) {
    for (const [filename, data] of Object.entries(files)) {
      // fullPath aligné sur la convention dupDetect (baseDir + relPath)
      members.push({
        side: 'source',
        fullPath: `${dir}/${data.path}`,
        filename,
        dir,
        duration: data.duration ?? null,
        codec: data.codec ?? null,
        score: 0,
      });
    }
  }
  return members;
}

/** Construit les groupes de versions depuis les index des deux côtés. */
export function buildVersionGroups(
  eparsFiles: Record<string, Record<string, { path: string; duration?: number | null; codec?: string | null }>>,
  sourceFiles: Record<string, Record<string, { path: string; duration?: number | null; codec?: string | null }>>,
): VersionGroup[] {
  const raw = collectMembers(eparsFiles, sourceFiles);
  const nodes: Node[] = raw.map(m => ({
    member: m,
    norm: normalizeName(m.filename),
    parent: -1,
  }));
  nodes.forEach((n, i) => {
    n.parent = i;
  });

  // Arêtes : durée compatible (±2 s, None exclu) ET nom similaire.
  // Pour limiter l'O(n²) : index par clé de durée arrondie ±2.
  const byDuration = new Map<number, number[]>();
  nodes.forEach((n, i) => {
    if (n.member.duration != null) {
      const key = Math.round(n.member.duration);
      for (let off = -DURATION_TOLERANCE; off <= DURATION_TOLERANCE; off++) {
        const k = key + off;
        const list = byDuration.get(k);
        if (list) list.push(i);
        else byDuration.set(k, [i]);
      }
    }
  });
  const seen = new Set<string>();
  nodes.forEach((n, i) => {
    if (n.member.duration == null) return;
    const key = Math.round(n.member.duration);
    for (const j of byDuration.get(key) ?? []) {
      if (j <= i) continue;
      const pair = `${Math.min(i, j)}:${Math.max(i, j)}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      const other = nodes[j];
      if (other.member.duration == null) continue;
      if (Math.abs(other.member.duration - n.member.duration) > DURATION_TOLERANCE) continue;
      if (n.norm !== other.norm && nameSimilarity(n.norm, other.norm) < 0.88) continue;
      union(nodes, i, j);
    }
  });

  // Racines → groupes
  const clusters = new Map<number, number[]>();
  nodes.forEach((_, i) => {
    const r = find(nodes, i);
    const list = clusters.get(r);
    if (list) list.push(i);
    else clusters.set(r, [i]);
  });

  const groups: VersionGroup[] = [];
  for (const indices of clusters.values()) {
    if (indices.length < 2) continue; // un exemplaire isolé n'est pas un doublon
    const members = indices.map(i => {
      const m = nodes[i].member;
      return { ...m, score: qualityScore(m.codec) };
    });
    // Arbitrage : score desc, durée desc (full vs radio edit), chemin asc (déterministe)
    const sorted = [...members].sort(
      (a, b) => b.score - a.score || (b.duration ?? 0) - (a.duration ?? 0) || a.fullPath.localeCompare(b.fullPath),
    );
    const winner = sorted[0];
    const losers = sorted.slice(1);
    const bestSource = members
      .filter(m => m.side === 'source')
      .sort(
        (a, b) => b.score - a.score || (b.duration ?? 0) - (a.duration ?? 0) || a.fullPath.localeCompare(b.fullPath),
      )[0];
    groups.push({
      key: [...members].map(m => m.fullPath).sort()[0],
      members,
      winner,
      losers,
      winnerNeedsCopy: winner.side === 'epars',
      copyTargetDir: winner.side === 'epars' ? (bestSource?.dir ?? null) : null,
    });
  }
  groups.sort((a, b) => a.key.localeCompare(b.key));
  return groups;
}

/** Le plan d'un groupe est-il applicable tel quel ? (gagnant rangé, ou cible connue) */
export function groupPlanApplicable(g: VersionGroup): boolean {
  return !g.winnerNeedsCopy || g.copyTargetDir != null;
}
