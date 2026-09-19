// ─── Taxonomie des styles (EPIC-035) — module pur, sans DOM ────────────────
// La colonne droite (Source Data) est à plat : chaque dossier suit la grammaire
// `<style>_<tranche>` (tranche = palier de 5 ans) ou `<style>` seul pour les
// styles « hors temps » (italo_disco, intro…). Le style est la SEULE décision
// humaine : la tranche se déduit de l'année du tag, le dossier cible est une
// fonction dest(style, année). Source de vérité = les dossiers existants —
// aucune liste à maintenir à la main.

import type { FileIndex } from './state.js';

export interface StyleDef {
  /** Identifiant = nom du dossier sans tranche ('techno_acid'). */
  id: string;
  /** Premier segment ('techno') — hiérarchie racine + modificateurs. */
  root: string;
  /** Aucun dossier daté n'existe pour ce style → destination sans tranche. */
  timeless: boolean;
  /** Dossiers existants portant ce style ('techno_acid_1990', …). */
  folders: Set<string>;
  /** Nombre de fichiers rangés sous ce style (ordre d'attribution des hotkeys). */
  count: number;
}

export interface Taxonomy {
  /** Racine Source Data (telle que configurée, slash final éventuel conservé). */
  root: string;
  styles: Map<string, StyleDef>;
}

/** Choix de session posé sur un fichier épars. `tranche` = surcharge explicite
 *  (fichier sans année, ou volonté de forcer un autre palier). */
export interface StyleChoice {
  style: string;
  tranche: number | null;
}

export interface Destination {
  /** Nom du dossier cible ('techno_acid_1990') — ou l'id du style si needsYear. */
  name: string;
  /** Chemin absolu du dossier cible ; '' si needsYear. */
  dir: string;
  /** Le dossier existe déjà à droite (sinon /copy le créera). */
  exists: boolean;
  /** Style daté, mais ni année ni tranche forcée : la palette doit demander. */
  needsYear: boolean;
}

/** Paliers proposés par la palette (touches 1-9). Constante : 9 valeurs = 9
 *  chiffres ; un palier hors de cette plage n'a pas de touche (cas inexistant
 *  dans la collection : 1985 → 2025 mesuré). */
export const TRANCHES: readonly number[] = [1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025];

const FOLDER_RX = /^(?<style>[a-z]+(?:_[a-z]+)*?)(?:_(?<tranche>\d{4}))?$/;

/** `techno_acid_1990` → {style:'techno_acid', tranche:1990} ; `intro` →
 *  {style:'intro', tranche:null} ; hors grammaire → null. */
export function parseFolderName(name: string): { style: string; tranche: number | null } | null {
  const m = FOLDER_RX.exec(name);
  if (!m?.groups) return null;
  const tranche = m.groups.tranche ? Number(m.groups.tranche) : null;
  return { style: m.groups.style, tranche };
}

/** Palier de 5 ans inférieur ou égal : 1994 → 1990, 1995 → 1995. */
export function trancheOf(year: number): number {
  return year - (year % 5);
}

/** Année entière depuis le tag du scan ('1994', '1994-05-01') ; sinon null. */
export function yearOf(entry: { year: string | null } | undefined): number | null {
  const m = entry?.year ? /^(\d{4})/.exec(entry.year) : null;
  return m ? Number(m[1]) : null;
}

/** MÊME convention que le reste de l'app (`sourceTree` : `${basePath}/${name}`,
 *  `dupDetect` : `${baseDir}/${path}`, `copyFilesTo` : `destDir.startsWith(`${dir}/`)`) :
 *  la racine est jointe TELLE QUELLE, slash final inclus → `…/style//techno_1990`
 *  quand la config porte un slash final. Normaliser ici casserait le patch
 *  d'index, le reveal post-copie et l'exclusion des jumeaux (vérifié en revue). */
function joinRoot(root: string, name: string): string {
  return `${root}/${name}`;
}

function addFolder(styles: Map<string, StyleDef>, folder: string, count: number): void {
  const parsed = parseFolderName(folder);
  if (!parsed) return;
  let def = styles.get(parsed.style);
  if (!def) {
    def = { id: parsed.style, root: parsed.style.split('_')[0], timeless: true, folders: new Set(), count: 0 };
    styles.set(parsed.style, def);
  }
  def.folders.add(folder);
  def.count += count;
  if (parsed.tranche !== null) def.timeless = false;
}

/** Taxonomie dérivée des dossiers de premier niveau de la (seule) racine Source
 *  Data + des dossiers vides créés via ➕ (extraDirs, EPIC-027). Racine absente
 *  ou sans fichier → null. Fichiers à la racine et dossiers hors grammaire :
 *  ignorés silencieusement. */
export function buildTaxonomy(sourceFiles: Record<string, FileIndex>, extraDirs: Iterable<string>): Taxonomy | null {
  const root = Object.keys(sourceFiles)[0];
  if (!root) return null;
  const files = sourceFiles[root];
  if (!files || Object.keys(files).length === 0) return null;

  const counts = new Map<string, number>();
  for (const entry of Object.values(files)) {
    const slash = entry.path.indexOf('/');
    if (slash <= 0) continue; // fichier à la racine
    const folder = entry.path.slice(0, slash);
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  const styles = new Map<string, StyleDef>();
  for (const [folder, n] of counts) addFolder(styles, folder, n);

  // Extra dirs : joints par le serveur (os.path.join → slash simple) ou par
  // l'UI (double slash possible) — comparaison du parent sans slashs finaux.
  const rootNoSlash = root.replace(/\/+$/, '');
  for (const extra of extraDirs) {
    const parent = extra.slice(0, extra.lastIndexOf('/')).replace(/\/+$/, '');
    if (parent !== rootNoSlash) continue;
    addFolder(styles, extra.slice(extra.lastIndexOf('/') + 1), 0);
  }
  return { root, styles };
}

/** Dossier cible pour (style, année, tranche forcée). Style inconnu → null. */
export function destFor(
  tax: Taxonomy,
  styleId: string,
  year: number | null,
  forcedTranche: number | null = null,
): Destination | null {
  const def = tax.styles.get(styleId);
  if (!def) return null;
  if (def.timeless) {
    return { name: def.id, dir: joinRoot(tax.root, def.id), exists: def.folders.has(def.id), needsYear: false };
  }
  const tranche = forcedTranche ?? (year !== null ? trancheOf(year) : null);
  if (tranche === null) return { name: def.id, dir: '', exists: false, needsYear: true };
  const name = `${def.id}_${tranche}`;
  return { name, dir: joinRoot(tax.root, name), exists: def.folders.has(name), needsYear: false };
}

/** Retrouve l'entrée épars d'un fullpath (`<eparDir>/<relPath>`) : dossier
 *  racine épars qui préfixe le chemin + entrée par nom de fichier. null si
 *  inconnu (fichier disparu, index périmé). */
export function findEparsEntry(
  eparsFiles: Record<string, FileIndex>,
  fullpath: string,
): { eparDir: string; filename: string; entry: FileIndex[string] } | null {
  const filename = fullpath.slice(fullpath.lastIndexOf('/') + 1);
  for (const [eparDir, files] of Object.entries(eparsFiles)) {
    const entry = files[filename];
    if (entry && `${eparDir}/${entry.path}` === fullpath) return { eparDir, filename, entry };
  }
  return null;
}

/** Hotkeys déterministes : styles par volume décroissant (puis id), chacun
 *  prend la première lettre libre parmi : initiales de ses segments, puis
 *  lettres de son id, puis n'importe quelle lettre libre a-z. Épuisé → null. */
export function deriveHotkeys(tax: Taxonomy): Map<string, string | null> {
  const ordered = [...tax.styles.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  const taken = new Set<string>();
  const out = new Map<string, string | null>();
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  for (const def of ordered) {
    const candidates = [...def.id.split('_').map(seg => seg[0]), ...def.id.replace(/_/g, ''), ...alphabet];
    const key = candidates.find(c => !taken.has(c)) ?? null;
    if (key) taken.add(key);
    out.set(def.id, key);
  }
  return out;
}
