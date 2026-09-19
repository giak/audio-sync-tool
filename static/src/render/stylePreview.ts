// ─── Aperçu du rangement par style « e » (EPIC-035) ────────────────────────
// Transforme les choix de session (state.styleChoices) en plan groupé par
// dossier cible, l'affiche dans le confirmDialog standard, puis enchaîne les
// copies dossier par dossier via copyFilesTo (le flux F5 extrait). Exclus et
// listés : fichiers sans année (style daté, tranche non tranchée), fichiers
// dont le jumeau (dupMatches) est déjà dans le dossier cible, styles disparus
// des dossiers. Rien n'est copié sans passer par l'aperçu.

import { copyFilesTo } from '../actions.js';
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

function plural(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
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
      `⤷ ${plan.twinInDest.length} déjà rangé${plan.twinInDest.length > 1 ? 's' : ''} dans le dossier cible — ${ign(plan.twinInDest.length)}`,
    );
  if (plan.unknownStyle.length)
    lines.push(
      `? ${plural(plan.unknownStyle.length, 'style')} inconnu${plan.unknownStyle.length > 1 ? 's' : ''} des dossiers actuels — ${ign(plan.unknownStyle.length)}`,
    );
  return lines.join('\n');
}

/** Enchaîne les copies dossier par dossier (séquentiel : copyFilesTo mute
 *  l'index et recharge le journal), retire des choix les fichiers copiés,
 *  laisse les échecs/exclus en session. Renvoie {copied, total}. */
export async function applyRangementPlan(plan: RangementPlan): Promise<{ copied: number; total: number }> {
  const done: string[] = [];
  let total = 0;
  for (const g of plan.groups) {
    total += g.files.length;
    done.push(...(await copyFilesTo(g.dest.dir, g.files)));
  }
  if (done.length) {
    const next = new Map(state.styleChoices);
    for (const fp of done) next.delete(fp);
    state.styleChoices = next;
    refreshStyleCells(done);
  }
  updateStyleRecap();
  showToast(`✓ ${done.length}/${total} copié${done.length > 1 ? 's' : ''} · ${plural(plan.groups.length, 'dossier')}`);
  return { copied: done.length, total };
}

/** `e` : aperçu → confirmation → apply. Plan vide → barre d'état. */
export function openStylePreview(): void {
  const plan = buildRangementPlan();
  const statusText = document.getElementById('status-text');
  if (plan.groups.length === 0) {
    if (statusText) {
      statusText.textContent =
        state.styleChoices.size === 0
          ? 'Aucun style posé — g sur un fichier épars pour commencer.'
          : `Rien à copier : ${formatPlan(plan).replace(/\n/g, ' · ') || 'choix sans destination'}`;
    }
    return;
  }
  const total = plan.groups.reduce((n, g) => n + g.files.length, 0);
  confirmDialog(formatPlan(plan), () => void applyRangementPlan(plan), `Appliquer ${plural(total, 'copie')}`);
}
