// ─── Alignement du genre sur l'arborescence (EPIC-044) ────────────────────
// L'arborescence de Source Data EST la déclaration de style (`<style>_<tranche>` :
// `techno_acid_1990`) ; le tag genre, lui, vient d'ailleurs (iTunes, Deezer,
// Beatport, convertisseurs). Mesuré sur la collection : sur 1 604 rangés,
// **1 023** contredisent leur dossier (« Techno », « Electronic », « Dance »…) et
// **258** n'ont aucun genre — la cellule *Style*, le filtre et l'indice de
// suggestion travaillent donc sur une valeur qui contredit le rangement.
//
// Le flux reprend celui des années (aperçu → confirmation → écriture → journal) :
//   GET  /styles/audit  — aperçu depuis le cache du dernier scan, RIEN n'est écrit
//   POST /styles/align  — écriture confirmée, le SERVEUR recalcule le plan et
//                         renvoie la liste exacte de ce qui a changé
// Deux modes, dans un seul dialogue : corriger + remplir, ou remplir SEULEMENT
// les vides (l'action additive). L'année n'est jamais touchée, et le journal est
// celui des scripts (`apply_styles.py --undo` restaure — y compris `old: null`).

import { api } from '../api.js';
import { setStatus } from '../core/feedback.js';
import { fmtCount } from '../core/format.js';
import { state } from '../state.js';
import { choiceDialog, showError, showToast } from '../ui.js';

export type AlignMode = 'tous' | 'vides';

export interface GenreAudit {
  ok: boolean;
  total: number;
  avec_style: number;
  alignes: number;
  a_corriger: number;
  sans_genre: number;
  hors_grammaire: number;
  par_style: Array<{ style: string; a_corriger: number; sans_genre: number; total: number }>;
  exemples: Array<{ path: string; genre: string | null; style: string }>;
}

export interface AlignWrite {
  path: string;
  style: string;
  old: string | null;
  frame: string | null;
}

export interface AlignResult {
  ok: boolean;
  mode: AlignMode;
  dry_run: boolean;
  plan: number;
  written: AlignWrite[];
  skipped: { deja: number; non_vide: number; absent: number; extension: number };
  failed: Array<{ path: string; error: string }>;
  failed_total: number;
  by_style: Record<string, number>;
  journal: string;
}

/** Reste à aligner pour un mode donné (pur). « tous » = les deux colonnes du
 *  bilan, « vides » = seulement les fichiers sans genre. */
export function planCount(audit: GenreAudit, mode: AlignMode): number {
  return mode === 'vides' ? audit.sans_genre : audit.a_corriger + audit.sans_genre;
}

/** Message du dialogue d'aperçu : d'où viennent les chiffres, ce qu'est la
 *  référence, les styles les plus touchés, et les garde-fous (année, journal). */
export function auditMessage(audit: GenreAudit): string {
  const lines = [
    "Genre des fichiers rangés — d'après le dernier scan :",
    `${fmtCount(audit.a_corriger)} contredisent leur dossier · ${fmtCount(audit.sans_genre)} n'ont pas de genre · ${fmtCount(audit.alignes)} sont déjà alignés.`,
    'Référence : le nom du dossier (« techno_acid_1990 » → « techno_acid »).',
  ];
  const top = audit.par_style
    .slice(0, 3)
    .map(p => `${p.style} (${fmtCount(p.total)})`)
    .join(', ');
  if (top) lines.push(`Plus touchés : ${top}.`);
  lines.push("L'année n'est pas touchée · journal partagé (apply_styles.py --undo).");
  return lines.join('\n');
}

/** Libellés des deux actions — chacun DIT son mode, il ne le suggère pas. */
export function alignLabels(audit: GenreAudit): { tous: string; vides: string } {
  return {
    tous: `Corriger ${fmtCount(audit.a_corriger)} + remplir ${fmtCount(audit.sans_genre)}`,
    vides: `Remplir seulement les ${fmtCount(audit.sans_genre)} vides`,
  };
}

/** Note de résultat (statut + toast) construite depuis la réponse du serveur.
 *  Les refus sont NOMMÉS : « vides » sur un cache périmé, fichier déplacé depuis
 *  le scan, format non géré — sinon un lot de 1 281 fichiers paraîtrait partiel
 *  sans raison lisible. */
export function alignNote(res: AlignResult): string {
  const n = res.written.length;
  const parts = [`✓ ${fmtCount(n)} genre${n > 1 ? 's' : ''} aligné${n > 1 ? 's' : ''}`];
  const s = res.skipped;
  if (s.non_vide) parts.push(`${fmtCount(s.non_vide)} déjà taggé${s.non_vide > 1 ? 's' : ''} sur le disque`);
  if (s.deja) parts.push(`${fmtCount(s.deja)} déjà au bon style`);
  if (s.absent) parts.push(`${fmtCount(s.absent)} absent${s.absent > 1 ? 's' : ''} du disque`);
  if (s.extension) parts.push(`${fmtCount(s.extension)} format non géré`);
  if (res.failed_total) parts.push(`⚠ ${fmtCount(res.failed_total)} échec${res.failed_total > 1 ? 's' : ''}`);
  parts.push(`journal ${res.journal} (--undo)`);
  return parts.join(' · ');
}

/** Aperçu (lecture seule). null + erreur affichée si le serveur ne répond pas. */
export async function fetchGenreAudit(): Promise<GenreAudit | null> {
  try {
    return await api<GenreAudit>('/styles/audit');
  } catch (err) {
    showError(`Aperçu impossible : ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Répercute les écritures du serveur sur l'état local. Un genre de RANGÉ est
 *  lu par la palette (« genre actuel », et l'indice de suggestion) : sans ce
 *  patch, l'état contredirait le disque dès la première palette. Aucun DOM n'est
 *  recréé — le genre d'un rangé n'est affiché nulle part aujourd'hui, et refaire
 *  1 600 lignes pour rien coûterait une frame. */
export function patchAlignedGenres(writes: AlignWrite[]): number {
  const trim = (p: string) => p.replace(/\/+$/, '');
  let patched = 0;
  for (const w of writes) {
    for (const root of Object.keys(state.sourceFiles)) {
      const base = trim(root);
      if (!w.path.startsWith(`${base}/`)) continue;
      const rel = w.path.slice(base.length + 1);
      for (const entry of Object.values(state.sourceFiles[root])) {
        if (trim(entry.path ?? '') === rel) {
          entry.genre = w.style;
          patched++;
        }
      }
      break;
    }
  }
  return patched;
}

/** Applique un mode après confirmation. Le serveur recalcule le plan : on ne lui
 *  envoie QUE le mode (aucun style, aucun chemin). */
async function runAlign(mode: AlignMode, audit: GenreAudit): Promise<void> {
  setStatus(`Alignement des genres (${mode === 'vides' ? 'vides seulement' : 'corriger + remplir'})…`);
  const n = planCount(audit, mode);
  try {
    const res = await api<AlignResult>('/styles/align', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    });
    const patched = patchAlignedGenres(res.written);
    const note = alignNote(res);
    if (res.failed_total > 0) {
      showError(note);
    } else {
      setStatus(`${note} — ${fmtCount(patched)} entrée(s) d'index à jour`);
      showToast(note);
    }
  } catch (err) {
    showError(`Alignement échoué (${fmtCount(n)} visés) : ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Commande `a` : aperçu → confirmation (deux modes) → alignement. */
export async function openGenreAudit(): Promise<void> {
  setStatus('Analyse du genre des fichiers rangés…');
  const audit = await fetchGenreAudit();
  if (!audit) return;
  const todo = planCount(audit, 'tous');
  if (todo === 0) {
    setStatus(
      `✓ Rien à aligner : ${fmtCount(audit.alignes)} fichier(s) rangé(s) portent déjà le style de leur dossier.`,
    );
    return;
  }
  const labels = alignLabels(audit);
  const bothReachable = choiceDialog(
    auditMessage(audit),
    { label: labels.tous, run: () => void runAlign('tous', audit) },
    { label: labels.vides, run: () => void runAlign('vides', audit) },
  );
  if (!bothReachable) {
    setStatus(
      "Template périmé (pas de #dialog-alt) : seule l'action « corriger + remplir » est proposée — recharge la page pour l'option « vides seulement ».",
    );
  }
}
