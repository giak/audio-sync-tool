// ─── Aperçu du rangement par style « e » (EPIC-035) ────────────────────────
// Transforme les choix de session (state.styleChoices) en plan groupé par
// dossier cible, l'affiche dans le confirmDialog standard, puis enchaîne les
// copies dossier par dossier via copyFilesTo (le flux F5 extrait). Exclus et
// listés : fichiers sans année (style daté, tranche non tranchée), fichiers
// dont le jumeau (dupMatches) est déjà dans le dossier cible, styles disparus
// des dossiers. Rien n'est copié sans passer par l'aperçu.

import { copyFilesTo } from '../actions.js';
import { api } from '../api.js';
import { setStatus } from '../core/feedback.js';
import { plural } from '../core/format.js';
import { state } from '../state.js';
import { type Destination, destFor, findEparsEntry, yearOf } from '../styles.js';
import { confirmDialog, showToast } from '../ui.js';
import { currentTaxonomy, refreshStyleCells, updateStyleRecap } from './styleCell.js';

export interface PlanFile {
  filename: string;
  eparDir: string;
  fullpath: string;
}
export interface PlanGroup {
  dest: Destination;
  files: PlanFile[];
}
export interface RangementPlan {
  /** Groupes triés par nom de dossier cible. */
  groups: PlanGroup[];
  /** Style daté sans année ni tranche : exclus (style conservé en session). */
  noYear: string[];
  /** Jumeau (EPIC-028) déjà dans le dossier cible : exclus (doublon évité). */
  twinInDest: string[];
  /** Style absent des dossiers actuels : exclus. */
  unknownStyle: string[];
}

/** Plan pur sur le state courant. Les choix de fichiers disparus de l'index
 *  épars sont ignorés silencieusement (index périmé). */
export function buildRangementPlan(): RangementPlan {
  const plan: RangementPlan = { groups: [], noYear: [], twinInDest: [], unknownStyle: [] };
  const tax = currentTaxonomy();
  const byDir = new Map<string, PlanGroup>();
  for (const [fullpath, choice] of state.styleChoices) {
    const found = findEparsEntry(state.eparsFiles, fullpath);
    if (!found) continue;
    const dest = tax ? destFor(tax, choice.style, yearOf(found.entry), choice.tranche) : null;
    if (!dest) {
      plan.unknownStyle.push(fullpath);
      continue;
    }
    if (dest.needsYear) {
      plan.noYear.push(fullpath);
      continue;
    }
    const twin = state.dupMatches.get(fullpath)?.sourceFullPath;
    if (twin?.startsWith(`${dest.dir}/`)) {
      plan.twinInDest.push(fullpath);
      continue;
    }
    let group = byDir.get(dest.dir);
    if (!group) {
      group = { dest, files: [] };
      byDir.set(dest.dir, group);
    }
    group.files.push({ filename: found.filename, eparDir: found.eparDir, fullpath });
  }
  plan.groups = [...byDir.values()].sort((a, b) => a.dest.name.localeCompare(b.dest.name));
  return plan;
}

/** Texte multi-ligne pour confirmDialog (#dialog-msg est en pre-line). */
export function formatPlan(plan: RangementPlan): string {
  const lines: string[] = [];
  for (const g of plan.groups) {
    const mark = g.dest.exists ? '→' : '→ ➕';
    const suffix = g.dest.exists ? '' : ' (sera créé)';
    lines.push(`${mark} ${g.dest.name} — ${plural(g.files.length, 'fichier')}${suffix}`);
  }
  const ign = (n: number) => `ignoré${n > 1 ? 's' : ''}`;
  if (plan.noYear.length)
    lines.push(
      `⚠ ${plural(plan.noYear.length, 'fichier')} sans année — ${ign(plan.noYear.length)} (g puis chiffre pour trancher)`,
    );
  if (plan.twinInDest.length)
    lines.push(
      `⤷ ${plural(plan.twinInDest.length, 'déjà rangé', 'déjà rangés')} dans le dossier cible — ${ign(plan.twinInDest.length)}`,
    );
  if (plan.unknownStyle.length)
    lines.push(
      `? ${plural(plan.unknownStyle.length, 'style inconnu', 'styles inconnus')} des dossiers actuels — ${ign(plan.unknownStyle.length)}`,
    );
  return lines.join('\n');
}

/** Enchaîne les copies dossier par dossier (séquentiel : copyFilesTo mute
 *  l'index et recharge le journal), retire des choix les fichiers copiés,
 *  laisse les échecs/exclus en session. Exporte les choix (style →
 *  /styles/review, EPIC-035 P3) pour apply_styles.py --review. Renvoie
 *  {copied, total}. */
export async function applyRangementPlan(plan: RangementPlan): Promise<{ copied: number; total: number }> {
  const done: string[] = [];
  let total = 0;
  for (const g of plan.groups) {
    total += g.files.length;
    done.push(...(await copyFilesTo(g.dest.dir, g.files)));
  }
  if (done.length) {
    await exportStyleChoices(done);
    const next = new Map(state.styleChoices);
    for (const fp of done) next.delete(fp);
    state.styleChoices = next;
    refreshStyleCells(done);
  }
  updateStyleRecap();
  showToast(`✓ ${done.length}/${total} copié${done.length > 1 ? 's' : ''} · ${plural(plan.groups.length, 'dossier')}`);
  return { copied: done.length, total };
}

/** POST /styles/review : persiste {fullpath: {style, tranche}} pour
 *  apply_styles.py --review (écriture TCON hors navigateur). Échec non
 *  bloquant : la copie a réussi, un simple message d'état suffit. */
async function exportStyleChoices(fullpaths: string[]): Promise<void> {
  const choices: Record<string, { style: string; tranche: number | null }> = {};
  for (const fp of fullpaths) {
    const c = state.styleChoices.get(fp);
    if (c) choices[fp] = { style: c.style, tranche: c.tranche };
  }
  if (Object.keys(choices).length === 0) return;
  try {
    await api('/styles/review', {
      method: 'POST',
      body: JSON.stringify({ choices }),
    });
  } catch (err) {
    setStatus(`Copies ok — export des styles échoué : ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** `e` : aperçu → confirmation → apply. Plan vide → barre d'état. */
export function openStylePreview(): void {
  const plan = buildRangementPlan();
  if (plan.groups.length === 0) {
    setStatus(
      state.styleChoices.size === 0
        ? 'Aucun style posé — g sur un fichier épars pour commencer.'
        : `Rien à copier : ${formatPlan(plan).replace(/\n/g, ' · ') || 'choix sans destination'}`,
    );
    return;
  }
  const total = plan.groups.reduce((n, g) => n + g.files.length, 0);
  confirmDialog(formatPlan(plan), () => void applyRangementPlan(plan), `Appliquer ${plural(total, 'copie')}`);
}
