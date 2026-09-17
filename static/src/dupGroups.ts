// ─── Groupes de versions (EPIC-028 v2 + EPIC-032 : deux niveaux) ──────────
// Niveau 1 (inchangé) : mêmes ENREGISTREMENTS — durée ±2 s + nom ≥ 0,88 →
// arbitrage qualité, perdants rangés proposés au trash (jamais automatique).
// Niveau 2 (EPIC-032) : VERSIONS d'un même MORCEAU — clé musicale (artiste,
// titre) via musicKey.ts, union par inclusion de tokens, durées libres.
// Un groupe peut donc contenir plusieurs cohortes d'enregistrements : seul le
// gagnant de la cohorte arbitrée est désigné, les autres cohortes (versions)
// sont marquées sameRecording:false — jamais trashées (revue humaine).
// Arbitrage : le meilleur score qualité survit, les perdants sont proposés au
// trash — aucune action automatique, toujours une revue humaine.

import { nameSimilarity, normalizeName, qualityScore } from './dupDetect.js';
import { artistsCompatible, containsTokens, keyTokens, musicKey } from './musicKey.js';

export interface GroupMember {
  side: 'epars' | 'source';
  fullPath: string;
  filename: string;
  dir: string;
  duration: number | null;
  codec: string | null;
  score: number;
  /** EPIC-032 : même enregistrement que le gagnant arbitré (durée ±2 s).
   *  false = autre version du même morceau — exclu de l'arbitrage et du trash. */
  sameRecording: boolean;
}

export interface VersionGroup {
  /** Représentant stable : le membre au chemin le plus petit (tri déterministe). */
  key: string;
  members: GroupMember[];
  /** Gagnant arbitré (meilleur score de SA cohorte, tie-break durée puis chemin). */
  winner: GroupMember;
  /** Perdants proposés au trash = cohorte du gagnant moins le gagnant
   *  (jamais automatique — revue obligatoire). Les versions n'y figurent pas. */
  losers: GroupMember[];
  /** Le gagnant est-il côté épars → plan = copier vers le dossier du meilleur rangé. */
  winnerNeedsCopy: boolean;
  /** Dossier où copier le gagnant épars (dossier du meilleur rangé DE SA cohorte),
   *  sinon null. */
  copyTargetDir: string | null;
}

export const DURATION_TOLERANCE = 2;

/** Deux durées désignent-elles a priori le même enregistrement ?
 *  Strict : il faut les deux durées connues et Δ ≤ tolérance (utilisé pour
 *  l'affichage des versions et la garde trash de applyGroupPlan). */
export function durationCompatible(a: { duration: number | null }, b: { duration: number | null }): boolean {
  if (a.duration == null || b.duration == null) return false;
  return Math.abs(a.duration - b.duration) <= DURATION_TOLERANCE;
}

// ── Clusterisation ────────────────────────────────────────────────────────

interface Node {
  member: GroupMember;
  norm: string;
  /** Clé musicale (EPIC-032) — artiste possiblement null. */
  mk: { artist: string | null; title: string };
  /** Tokens porteurs de la clé (artiste + titre, tokens faibles exclus). */
  tokens: Set<string>;
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
        sameRecording: true,
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
        sameRecording: true,
      });
    }
  }
  return members;
}

/** Tri canonique d'arbitrage : score desc, durée desc (full > radio), chemin asc. */
function betterMember(a: GroupMember, b: GroupMember): number {
  return b.score - a.score || (b.duration ?? 0) - (a.duration ?? 0) || a.fullPath.localeCompare(b.fullPath);
}

/** Construit les groupes de versions depuis les index des deux côtés. */
export function buildVersionGroups(
  eparsFiles: Record<string, Record<string, { path: string; duration?: number | null; codec?: string | null }>>,
  sourceFiles: Record<string, Record<string, { path: string; duration?: number | null; codec?: string | null }>>,
): VersionGroup[] {
  const raw = collectMembers(eparsFiles, sourceFiles);
  const nodes: Node[] = raw.map(m => {
    const mk = musicKey(m.filename);
    return {
      member: m,
      norm: normalizeName(m.filename),
      mk,
      tokens: new Set([...keyTokens(mk.artist ?? ''), ...keyTokens(mk.title)]),
      parent: -1,
    };
  });
  nodes.forEach((n, i) => {
    n.parent = i;
  });

  // ── Passe A (v1) : mêmes enregistrements — durée ±2 s ET nom similaire.
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

  // Instantané des composantes « même enregistrement » (passe A seule) —
  // sert plus bas aux cohortes de désignation du gagnant (A ⊆ A+B).
  const cohortOf = nodes.map((_, i) => find(nodes, i));

  // ── Passe B (EPIC-032) : mêmes MORCEAUX — inclusion de tokens de la clé
  // musicale, durées libres. Index par token pour éviter l'O(n²).
  const byToken = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    for (const w of n.tokens) {
      const list = byToken.get(w);
      if (list) list.push(i);
      else byToken.set(w, [i]);
    }
  });
  nodes.forEach((n, i) => {
    const candidates = new Set<number>();
    for (const w of n.tokens) {
      for (const j of byToken.get(w) ?? []) {
        if (j > i) candidates.add(j);
      }
    }
    for (const j of candidates) {
      const other = nodes[j];
      const short = n.tokens.size <= other.tokens.size ? n.tokens : other.tokens;
      const long = n.tokens.size <= other.tokens.size ? other.tokens : n.tokens;
      if (short.size < 2 || !containsTokens(short, long)) continue;
      if (!artistsCompatible(n.mk.artist, other.mk.artist)) continue;
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
    // Cohortes « même enregistrement » au sein du groupe (identité = racine passe A) —
    // servent UNIQUEMENT à désigner le gagnant : les cohortes confirmées (≥ 2 membres,
    // paires v1 durée+nom) priment sur les singletons (un FLAC isolé peut être une
    // autre version du morceau) ; puis meilleur score, taille, chemin (déterministe).
    const cohorts = new Map<number, GroupMember[]>();
    indices.forEach((idx, k) => {
      const c = cohortOf[idx];
      const list = cohorts.get(c);
      if (list) list.push(members[k]);
      else cohorts.set(c, [members[k]]);
    });
    const cohortRank = (list: GroupMember[]): [number, number, number, string] => {
      const best = [...list].sort(betterMember)[0];
      return [list.length >= 2 ? 0 : 1, -best.score, -list.length, best.fullPath];
    };
    const sortedCohorts = [...cohorts.values()].sort((a, b) => {
      const ra = cohortRank(a);
      const rb = cohortRank(b);
      return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2] || ra[3].localeCompare(rb[3]);
    });
    const winner = [...sortedCohorts[0]].sort(betterMember)[0];
    // Sémantique unique (alignée sur la garde trash d'actions.ts) : est « même
    // enregistrement que le gagnant » tout membre à durée ±2 s du gagnant.
    // Les autres (mix/album/radio) sont des VERSIONS — jamais trashées.
    for (const m of members) {
      m.sameRecording = durationCompatible(m, winner);
    }
    const losers = members.filter(m => m !== winner && m.side === 'source' && m.sameRecording);
    const bestSource = members.filter(m => m.side === 'source' && m.sameRecording).sort(betterMember)[0];
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
