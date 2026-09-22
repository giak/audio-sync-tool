// ─── Revue des années DÉJÀ écrites (EPIC-040, dernier maillon) ─────────────
// `scripts/audit_applied_years.py` rejoue le moteur corrigé sur les écritures
// du journal et classe chaque année écrite d'après les caches de sources :
// `confirme` (première sortie corroborée), `contredit` (le tag dit autre chose
// que la première sortie — le cas « réédition 2024 écrite comme année du
// morceau »), `a_revoir` (désaccord sans signature de réédition) et
// `non_verifie` (aucune source n'en parle). Le résultat vivait dans
// `data/year_audit.json` **sans aucune surface** : il fallait ouvrir le JSON à
// la main pour s'apercevoir qu'une réédition avait été écrite comme année.
//
// Cette section est cette surface, dans la vue Années :
//   GET  /years/audit         — l'audit, RIEN n'est écrit (lecture seule)
//   POST /years/audit/review  — décisions : `corriger` écrit TOUT DE SUITE
//                               (journal PARTAGÉ des scripts,
//                               `apply_years.py --undo` restaure — `old`
//                               conservé), `garder` ne touche à rien mais sort
//                               l'item de la file (persisté : sinon la revue
//                               reproposerait les mêmes cas à chaque ouverture).
//
// Après une décision on RELIT l'audit au lieu de re-dériver quoi que ce soit :
// l'affichage ne peut pas diverger du disque (le serveur valide le chemin, la
// présence et le confinement aux racines, et c'est lui qui a le dernier mot).

import { api } from '../api.js';
import { playingPath, togglePlay } from '../audio.js';
import { setStatus } from '../core/feedback.js';
import { fmtCount } from '../core/format.js';
import { choiceDialog } from '../ui.js';

/** Fiche de sortie telle que l'audit la collecte (un OBJET, pas une phrase :
 *  la revue la met en forme, elle ne l'affiche jamais tel quel). */
export interface YearAuditEvidence {
  artist?: string | null;
  title?: string | null;
  album?: string | null;
  release_date?: string | null;
}

export interface YearAuditItem {
  path: string;
  filename: string;
  applied: string | null;
  proposed: string | null;
  candidates: string[];
  reason: string | null;
  variant: string | null;
  /** {source: année} — l'année que CHAQUE source avance. */
  sources: Record<string, string>;
  evidence: YearAuditEvidence[];
  decision: { decision: string; year?: string | null } | null;
}

export interface YearAuditData {
  ok: boolean;
  files: number;
  counts: Record<string, number>;
  raisons: Record<string, number>;
  contredit: YearAuditItem[];
  a_revoir: YearAuditItem[];
  non_verifie: YearAuditItem[];
  confirme: YearAuditItem[];
}

/** Décision envoyée au serveur (`year` seulement pour une correction choisie). */
export interface YearDecision {
  path: string;
  action: 'corriger' | 'garder';
  year?: string;
}

export interface YearDecisionResult {
  ok: boolean;
  written: Array<{ path: string; old: string | null; year: string }>;
  kept: string[];
  deja: string[];
  failed: Array<{ path: string | null; error: string }>;
  reviewed: number;
}

const AUDIT_URL = '/years/audit';
const REVIEW_URL = '/years/audit/review';

let data: YearAuditData | null = null;

/** Items qui attendent ENCORE une décision (les décidés sortent de la file). */
export function pendings(audit: YearAuditData): YearAuditItem[] {
  return [...audit.contredit, ...audit.a_revoir].filter(i => !i.decision);
}

/** La ligne « pourquoi » : les années des sources (« deezer 2004 · musicbrainz
 *  1997 »), puis la sortie qui les explique. Sans mise en forme, la revue
 *  afficherait `[object Object]` — les fiches de l'audit sont des objets. */
export function evidenceLine(item: YearAuditItem): string {
  const parts: string[] = [];
  const sources = Object.entries(item.sources ?? {}).sort((a, b) => a[1].localeCompare(b[1]));
  if (sources.length) parts.push(sources.map(([src, year]) => `${src} ${year}`).join(' · '));
  for (const e of item.evidence ?? []) {
    const who = [e.artist, e.title].filter(Boolean).join(' — ');
    const what = [e.album ? `album « ${e.album} »` : '', e.release_date ?? ''].filter(Boolean).join(', ');
    const line = [who, what].filter(Boolean).join(' · ');
    if (line) parts.push(line);
  }
  return parts.join(' — ');
}

/** Crédit d'écriture : le lot corrigé (journal partagé, donc annulable). */
export function resultMessage(res: YearDecisionResult): string {
  const parts = [`⟲ ${fmtCount(res.written.length)} année(s) corrigée(s)`];
  if (res.deja.length) parts.push(`${fmtCount(res.deja.length)} déjà à jour`);
  if (res.kept.length) parts.push(`${fmtCount(res.kept.length)} gardée(s)`);
  if (res.failed.length) {
    parts.push(`${fmtCount(res.failed.length)} refusée(s) — ${res.failed[0]?.error ?? '?'}`);
  }
  parts.push('scripts/apply_years.py --undo restaure');
  return parts.join(' · ');
}

/** Bandeau de la section : ce qui a été audité, et où en est la revue. */
export function auditSummary(audit: YearAuditData): string {
  const c = audit.counts;
  const restants = pendings(audit).length;
  return (
    `⟲ Années déjà écrites — ${fmtCount(audit.files)} auditées · ` +
    `${fmtCount(c.confirme ?? 0)} confirmées · ${fmtCount(c.contredit ?? 0)} contredites · ` +
    `${fmtCount(c.a_revoir ?? 0)} à revoir · ${fmtCount(c.non_verifie ?? 0)} non vérifiées ` +
    `(${restants ? `${fmtCount(restants)} à trancher` : 'tout est tranché'})`
  );
}

/** Les `non_verifie` n'ont rien à trancher : leurs raisons sont toutes uniques
 *  (339 phrases) — la revue montre des CLASSES, pas 339 lignes. */
export function reasonsLine(audit: YearAuditData): string {
  const total = audit.counts.non_verifie ?? audit.non_verifie.length;
  if (!total) return '';
  const entries = Object.entries(audit.raisons).sort((a, b) => b[1] - a[1]);
  const byClass = entries.map(([k, v]) => `${fmtCount(v)} ${k}`).join(' · ');
  return `${fmtCount(total)} sans verdict : ${byClass}`;
}

/** Message du dialogue de confirmation d'un lot (aperçu AVANT écriture) : le
 *  compte vient des items, pas de l'appelant — un libellé qui mentirait sur le
 *  nombre serait le pire des aperçus. */
export function batchMessage(items: YearAuditItem[], action: 'corriger' | 'garder'): string {
  const n = fmtCount(items.length);
  if (action === 'garder') {
    return (
      `Garder ${n} cas ?\n\nAucun tag n’est touché — ces cas sortent de la file de revue ` +
      '(la décision est persistée, ils ne seront plus proposés).'
    );
  }
  const ex = items[0];
  return (
    `Écrire ${n} année(s) corrigée(s) ?\n\nRéférence : les caches de sources (première sortie). ` +
    `Exemple : ${ex?.filename ?? '?'} ${ex?.applied ?? '?'} → ${ex?.proposed ?? '?'}.\n` +
    'Journal partagé : scripts/apply_years.py --undo restaure les années d’avant.'
  );
}

/** Lit l'audit (lecture seule). Échec silencieux : la revue est un extra, la
 *  vue Années doit rester utilisable sans elle (route absente sur un process
 *  pas encore redémarré, fichier d'audit pas encore produit). Une réponse qui
 *  n'a pas la forme de l'audit est traitée comme absente : une page ne casse
 *  pas parce qu'un endpoint a changé de forme. */
export async function refreshYearAudit(): Promise<void> {
  try {
    const res = await api<YearAuditData>(AUDIT_URL);
    data = res && Array.isArray(res.contredit) && Array.isArray(res.a_revoir) ? res : null;
  } catch {
    data = null;
  }
}

export function resetYearAudit(): void {
  data = null;
}

/** Envoie des décisions et RELIT l'audit (le serveur est la référence). */
export async function submitDecisions(decisions: YearDecision[]): Promise<YearDecisionResult | null> {
  try {
    const res = await api<YearDecisionResult>(REVIEW_URL, {
      method: 'POST',
      body: JSON.stringify({ decisions }),
    });
    setStatus(resultMessage(res));
    await refreshYearAudit();
    return res;
  } catch (err) {
    setStatus(`Revue impossible : ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/** ▶ par item : juger une année fautive demande de l'écouter (player global). */
function playBtn(fullpath: string, filename: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'years-play play-btn';
  b.textContent = '▶';
  b.title = `Écouter ${filename}`;
  b.dataset.path = fullpath;
  b.onclick = (e): void => {
    e.stopPropagation();
    togglePlay(filename, fullpath, b);
  };
  if (playingPath() === fullpath) {
    b.classList.add('playing');
    b.textContent = '⏹';
  }
  return b;
}

function decide(decisions: YearDecision[], onChange: () => void): void {
  void submitDecisions(decisions).then(res => {
    if (res) onChange();
  });
}

/** Une ligne de revue : ce qui est écrit, ce que les sources disent, et les
 *  deux issues possibles (corriger — éventuellement à une autre candidate — ou
 *  garder tel quel). */
function auditRow(item: YearAuditItem, onChange: () => void): HTMLElement {
  const card = document.createElement('div');
  card.className = `years-card years-audit${item.proposed ? ' contredit' : ''}`;
  card.title = `${item.path} — ${item.reason ?? ''}`;

  const head = document.createElement('div');
  head.className = 'years-card-title';
  const verdict = item.proposed
    ? `<span class="years-badge">écrit ${esc(item.applied ?? '?')} → ${esc(item.proposed)}</span>`
    : `<span class="years-badge">écrit ${esc(item.applied ?? '?')} — à revoir</span>`;
  head.innerHTML = `⟲ ${esc(item.filename)} ${verdict}`;
  head.prepend(playBtn(item.path, item.filename));
  card.appendChild(head);

  const why = evidenceLine(item);
  if (why) {
    const el = document.createElement('div');
    el.className = 'years-reason';
    el.textContent = why;
    card.appendChild(el);
  }

  const acts = document.createElement('div');
  acts.className = 'years-cands';
  if (item.proposed) {
    const b = document.createElement('button');
    b.className = 'years-btn years-fix';
    b.textContent = `✓ Corriger → ${item.proposed}`;
    b.title = `Écrire ${item.proposed} dans le tag année (journal partagé, annulable)`;
    b.onclick = (e): void => {
      e.stopPropagation();
      decide([{ path: item.path, action: 'corriger', year: item.proposed ?? undefined }], onChange);
    };
    acts.appendChild(b);
  }
  // Les autres candidates restent accessibles : la proposition du moteur n'est
  // pas toujours la bonne (édition, remaster, compil) — aucune n'est inventée,
  // elles viennent de l'audit.
  for (const y of item.candidates.filter(y => y !== item.proposed)) {
    const b = document.createElement('button');
    b.className = 'years-btn';
    b.textContent = y;
    b.title = `Écrire ${y} (candidate de l'audit)`;
    b.onclick = (e): void => {
      e.stopPropagation();
      decide([{ path: item.path, action: 'corriger', year: y }], onChange);
    };
    acts.appendChild(b);
  }
  const keep = document.createElement('button');
  keep.className = 'years-btn years-keep';
  keep.textContent = '✓ Garder';
  keep.title = 'Le tag reste tel quel — le cas sort de la file (décision persistée)';
  keep.onclick = (e): void => {
    e.stopPropagation();
    decide([{ path: item.path, action: 'garder' }], onChange);
  };
  acts.appendChild(keep);
  card.appendChild(acts);
  return card;
}

/** Ajoute la section à la liste de la vue Années (rien si pas d'audit). */
export function renderYearAudit(list: HTMLElement, onChange: () => void): void {
  if (!data) return;
  const audit = data;
  const todo = pendings(audit);
  const withProposal = todo.filter(i => i.proposed);

  const title = document.createElement('div');
  title.className = 'years-section audit';
  title.textContent = auditSummary(audit);
  title.title = 'Audit des années déjà écrites (scripts/audit_applied_years.py) — décisions persistées';
  list.appendChild(title);

  if (todo.length === 0) {
    const done =
      audit.counts.corriger || audit.counts.garder
        ? `Tranché : ${fmtCount(audit.counts.corriger ?? 0)} corrigée(s), ${fmtCount(audit.counts.garder ?? 0)} gardée(s).`
        : 'Aucun désaccord (les tags sont cohérents avec les sources).';
    list.insertAdjacentHTML('beforeend', `<p class="years-empty">⟲ ${done}</p>`);
  } else {
    // Lot entier : c'est la même écriture que les lignes, en un geste — et le
    // dialogue dit ce qui va être écrit avant de le faire.
    const batch = document.createElement('div');
    batch.className = 'years-cands';
    if (withProposal.length) {
      const b = document.createElement('button');
      b.className = 'years-btn years-export';
      b.textContent = `✓ Corriger les ${fmtCount(withProposal.length)} proposées`;
      b.title = 'Écrire toutes les années proposées par l’audit (journal partagé, annulable)';
      b.onclick = (e): void => {
        e.stopPropagation();
        choiceDialog(batchMessage(withProposal, 'corriger'), {
          label: 'Corriger',
          run: () =>
            decide(
              withProposal.map(i => ({ path: i.path, action: 'corriger' as const, year: i.proposed ?? undefined })),
              onChange,
            ),
        });
      };
      batch.appendChild(b);
    }
    const k = document.createElement('button');
    k.className = 'years-btn years-keep';
    k.textContent = `✓ Garder les ${fmtCount(todo.length)}`;
    k.title = 'Ne rien écrire — sortir tous les cas restants de la file';
    k.onclick = (e): void => {
      e.stopPropagation();
      const dec: YearDecision[] = todo.map(i => ({ path: i.path, action: 'garder' as const }));
      choiceDialog(batchMessage(todo, 'garder'), {
        label: 'Garder',
        run: () => decide(dec, onChange),
      });
    };
    batch.appendChild(k);
    list.appendChild(batch);

    for (const item of todo) list.appendChild(auditRow(item, onChange));
  }

  const why = reasonsLine(audit);
  if (why) list.insertAdjacentHTML('beforeend', `<p class="years-empty">⟲ ${esc(why)}</p>`);
}
