// ─── Modale de copie « fichier → destination » (EPIC-051 P1) ───────────────
// La modale de validation de copie était une boîte générique : un #dialog-msg
// (`pre-line`) où « Copier "X" vers "Y" ? » et la phrase de consentement style
// (EPIC-043) se valaient typographiquement — l'utilisateur demandait à VOIR ce
// qui va se passer. La structure est désormais :
//
//     fichier.mp3  →  techno_hard_2005 ➕          ← évidence (l'action)
//             le style « techno_hard » sera écrit… ← discret (les conséquences)
//
// Un SEUL rendu pour les trois flux : F5 simple, F5 batch (drag / clic droit)
// et aperçu `e` (une ligne évidence par dossier cible). Le consentement et les
// exclusions restent énoncés — en plus discret, pas supprimés.

import { plural } from '../core/format.js';

/** Une destination avec ses fichiers (aperçu `e`), ou un couple fichier →
 *  destination (F5 simple/batch). Le rendu est le même : une ligne évidence
 *  par destination, le détail en discret. */
export interface CopyDialogGroup {
  /** Nom du dossier de destination (affiché en évidence). */
  destName: string;
  /** Dossier sera créé par /copy (os.makedirs) → badge ➕. */
  destCreated: boolean;
  /** Noms de fichiers copiés vers cette destination. */
  filenames: string[];
  /** Dossier complet (tooltip de la ligne évidence — la liste ne déborde pas
   *  de la modale, elle est lisible au survol). */
  destDir?: string;
}

/** Contenu complet de la modale : l'action en évidence, les conséquences en
 *  discret. Pur — le rendu DOM est séparé (testable sans modale). */
export interface CopyDialogSpec {
  groups: CopyDialogGroup[];
  /** Lignes discrètes sous l'évidence (consentement style, exclusions…). */
  notes: string[];
  /** Compteur multi (« 12 fichiers → 2 dossiers ») ; absent à l'unité. */
  summary?: string;
}

/** Bloc évidence d'une destination : « fichier.mp3 → techno_hard_2005 ➕ ».
 *  Un seul fichier → son nom ; plusieurs → compteur + la liste en tooltip. */
export function evidenceLine(g: CopyDialogGroup): string {
  const arrow = '→';
  const badge = g.destCreated ? ' ➕' : '';
  if (g.filenames.length === 1) return `${g.filenames[0]} ${arrow} ${g.destName}${badge}`;
  return `${g.filenames.length} fichiers ${arrow} ${g.destName}${badge}`;
}

/** Construit la spec depuis les groupes + le message de consentement/exclusions.
 *  `styleConsent` = sortie de styleConsentLine (EPIC-043) — déjà une phrase
 *  complète ou ''. `exclusions` = lignes d'exclusion déjà formatées (aperçu e :
 *  sans année, déjà rangé, style inconnu). */
export function buildCopyDialogSpec(
  groups: CopyDialogGroup[],
  opts: { styleConsent?: string; exclusions?: string[] } = {},
): CopyDialogSpec {
  const notes: string[] = [];
  if (opts.styleConsent) notes.push(opts.styleConsent);
  if (opts.exclusions?.length) notes.push(...opts.exclusions);
  const totalFiles = groups.reduce((n, g) => n + g.filenames.length, 0);
  const summary =
    groups.length > 1 || totalFiles > 1
      ? `${plural(totalFiles, 'fichier')} → ${plural(groups.length, 'dossier')}`
      : undefined;
  return { groups, notes, summary };
}

/** Ligne évidence STRUCTURÉE (revue du 2026-09-23 : « au premier coup d'œil,
 *  il faut voir ce qu'il va se passer ») — le fichier en blanc bold, la flèche
 *  en accent, la destination en cyan bold, badge « ➕ sera créé » si /copy
 *  créera le dossier. textContent de la ligne = evidenceLine(g) (les tests et
 *  le fallback texte lisent la même vérité). */
function evidenceRow(g: CopyDialogGroup): HTMLDivElement {
  const line = document.createElement('div');
  line.className = 'copy-evidence-line';
  if (g.destDir) line.title = g.destDir;
  const file = document.createElement('span');
  file.className = 'copy-file';
  file.textContent = g.filenames.length === 1 ? g.filenames[0] : plural(g.filenames.length, 'fichier');
  const arrow = document.createElement('span');
  arrow.className = 'copy-arrow';
  arrow.textContent = ' → '; // espaces dans le texte : textContent = evidenceLine
  const dest = document.createElement('span');
  dest.className = 'copy-dest';
  dest.textContent = g.destName;
  line.append(file, arrow, dest);
  if (g.destCreated) {
    const badge = document.createElement('span');
    badge.className = 'copy-badge';
    badge.textContent = '➕ sera créé';
    line.appendChild(badge);
  }
  return line;
}

/** Rend la spec dans #dialog-msg (remplace le texte brut des appelants).
 *  Structure DOM :
 *    .copy-evidence   (une ligne par groupe, évidence : spans fichier/→/dossier)
 *    .copy-notes      (blocs discrets, plus petits et grisés, une ligne chacun)
 *  Le #dialog-msg garde `white-space: pre-line` — inutile ici (chaque ligne
 *  est un élément), et sans effet sur les autres dialogues (prompt, a, e). */
export function renderCopyDialog(spec: CopyDialogSpec): void {
  const msgEl = document.getElementById('dialog-msg');
  if (!msgEl) return;
  msgEl.innerHTML = '';

  const ev = document.createElement('div');
  ev.className = 'copy-evidence';
  for (const g of spec.groups) ev.appendChild(evidenceRow(g));
  msgEl.appendChild(ev);

  if (spec.notes.length) {
    const notes = document.createElement('div');
    notes.className = 'copy-notes';
    for (const n of spec.notes) {
      const p = document.createElement('div');
      p.className = 'copy-note';
      p.textContent = n;
      p.title = n; // une ligne affichée : le texte intégral reste lisible au survol
      notes.appendChild(p);
    }
    msgEl.appendChild(notes);
  }

  if (spec.summary) {
    const s = document.createElement('div');
    s.className = 'copy-summary';
    s.textContent = spec.summary;
    msgEl.appendChild(s);
  }
}

/** Texte brut de secours : les tests jsdom et tout #dialog-msg absent d'un
 *  template d'une autre version retombent sur le message d'avant (une ligne
 *  par groupe + notes) — la leçon EPIC-042 : une information ne disparaît
 *  jamais sans bruit. */
export function copyDialogFallbackText(spec: CopyDialogSpec): string {
  const lines = spec.groups.map(g => evidenceLine(g));
  lines.push(...spec.notes);
  if (spec.summary) lines.push(spec.summary);
  return lines.join('\n');
}
