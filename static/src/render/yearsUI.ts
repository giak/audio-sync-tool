// ─── Vue Années manquantes (EPIC-033 T2/T4) : 4e page du routeur goPage ────
// Revue humaine des vagues à revue (ambiguïtés : bouton par candidate ; lax :
// accepter/rejeter). Les « certaines » sont listées pour info — l'ÉCRITURE
// réelle des tags reste faite par scripts/apply_years.py (jamais l'UI, pattern
// preview → confirmation). Les choix faits ici restent locaux tant qu'ils ne
// sont pas EXPORTÉS (bouton 💾 ou touche e) : POST /years/review les persiste
// dans data/year_review.json, consommé par scripts/apply_years.py --review.
//
// Données : GET /years/preview (app.py) — consolidation MB/Deezer → Discogs →
// iTunes → reform sans double comptage ; introuvables = compteur (aucune action).

import { api } from '../api.js';
import { playingPath, togglePlay } from '../audio.js';
import { subjectFromName } from '../filterEngine.js';
import { goPage } from '../router.js';
import { ensureFilterChip, isFilterActive, subjectMatches, updateFilterCount } from './filterChip.js';

export interface YearFile {
  path: string;
  filename: string;
  artist: string | null;
  title: string;
  status: 'found' | 'lax' | 'ambiguous';
  source: string | null;
  year: string | null;
  years: string[];
}

interface YearPreview {
  files_no_year: number;
  certaines: YearFile[];
  a_revue: YearFile[];
  introuvables: number;
}

let data: YearPreview | null = null;
let loadError: string | null = null;
let focusIndex = -1;

/** Choix de revue (session) : clé → année choisie, ou null = rejeté. */
const choices = new Map<string, string | null>();

/** Endpoint de persistance des choix (EPIC-033 P2) — consommé ensuite par
 * scripts/apply_years.py --review. */
const REVIEW_URL = '/years/review';

/** Scope du chip filtre de la page (F7/`, pattern EPIC-030) — mémorisé dans
 * state.filters : ré-afficher la page restaure le filtre. */
const YEARS_SCOPE = 'years';

/** Année saisie dans le champ libre (appliquée à la carte focusée à l'export). */
let replaceYear = '';

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/** Bouton ▶ attaché à un fichier (player bar globale, cf. sync) — les cartes
 * Années/Doublons écoutent avant de trancher. Re-render safe : re-marque si
 * c'est ce chemin qui joue (playingPath). */
function playBtn(fullpath: string, filename: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'years-play play-btn';
  b.textContent = '▶';
  b.title = `Écouter ${filename}`;
  b.dataset.path = fullpath;
  b.onclick = (e): void => {
    e.stopPropagation(); // ne pas focus/sélectionner la carte
    togglePlay(filename, fullpath, b);
  };
  if (playingPath() === fullpath) {
    b.classList.add('playing');
    b.textContent = '⏹';
  }
  return b;
}

/** Clé de cache (artiste\titre) d'un fichier — identifiant de choix. */
function keyOf(f: YearFile): string {
  return `${f.artist ?? ''}\t${f.title}`;
}

function setStatus(msg: string): void {
  const el = document.getElementById('status-text');
  if (el) el.textContent = msg;
}

/** Une carte à revue passe-t-elle le filtre actif du scope years ?
 * (artiste — titre, match tokens du filterEngine.) */
function reviewMatches(f: YearFile): boolean {
  return subjectMatches(YEARS_SCOPE, subjectFromName(`${f.artist ?? '?'} — ${f.title}`));
}

/** Reprise de session : charge les choix persistés (année ou rejet null).
 * Entrées validées comme au POST (clé avec tabulation, valeur 'YYYY' ou
 * null) ; échec silencieux : la revue reste utilisable sans reprise. */
async function loadChoices(): Promise<void> {
  try {
    const saved = await api<Record<string, string | null>>(REVIEW_URL);
    choices.clear();
    for (const [k, v] of Object.entries(saved)) {
      if (k.includes('\t') && (v === null || (typeof v === 'string' && /^\d{4}$/.test(v)))) {
        choices.set(k, v);
      }
    }
  } catch {
    /* pas de reprise — la revue repart des choix courants */
  }
}

/** Année de remplacement (champ libre) : si 4 chiffres sont saisis, l'appliquer
 * à la clé de la carte à revue focusée — en écrasant un choix antérieur.
 * Sans focus ou sans année valide : ne fait rien. */
function applyReplaceYear(): void {
  if (!/^\d{4}$/.test(replaceYear) || focusIndex < 0) return;
  const f = data?.a_revue[focusIndex];
  if (!f) return;
  choices.set(keyOf(f), replaceYear);
  replaceYear = '';
}

/** Exporte les choix courants (années choisies + rejets) vers
 * POST /years/review : persistance → scripts/apply_years.py --review.
 * Retourne le total de choix connus du backend, -1 si échec. */
export async function exportChoices(): Promise<number> {
  applyReplaceYear();
  const input = document.getElementById('years-year-input') as HTMLInputElement | null;
  if (input) input.value = replaceYear; // champ resynchronisé (année consommée)
  if (choices.size === 0) {
    setStatus('Aucun choix à exporter — choisissez une année ou rejetez d\u2019abord.');
    return 0;
  }
  const payload: Record<string, string | null> = {};
  for (const [k, v] of choices.entries()) payload[k] = v;
  try {
    const res = await api<{ ok: boolean; count: number }>(REVIEW_URL, {
      method: 'POST',
      body: JSON.stringify({ choices: payload }),
    });
    setStatus(
      `💾 ${Object.keys(payload).length} choix exportés (${res.count} persistés) — ` +
        'application : scripts/apply_years.py --review --apply',
    );
    return res.count;
  } catch (err) {
    setStatus(`Export impossible : ${err instanceof Error ? err.message : String(err)}`);
    return -1;
  }
}

async function refreshYears(): Promise<void> {
  loadError = null;
  try {
    data = await api<YearPreview>('/years/preview');
  } catch (err) {
    data = null;
    loadError = err instanceof Error ? err.message : String(err);
  }
}

// ── Render ────────────────────────────────────────────────────────────────

export function renderYears(): void {
  const list = document.getElementById('years-list');
  if (!list) return;
  // Chip filtre persistant (EPIC-030) : vit dans son slot AVANT la liste,
  // hors du DOM effacé ci-dessus — le focus/caret survivent à la saisie.
  ensureFilterChip(list, {
    scope: YEARS_SCOPE,
    placeholder: 'Filtrer artiste, titre, année…',
    onChange: () => {
      focusIndex = -1; // liste re-filtrée : le focus hérité n'a plus de sens
      renderYears();
    },
  });
  list.innerHTML = '';

  const count = document.getElementById('years-count');
  if (count) {
    count.textContent = data
      ? `(${data.certaines.length.toLocaleString('fr')} certaines · ` +
        `${data.a_revue.length.toLocaleString('fr')} à revue · ` +
        `${data.introuvables.toLocaleString('fr')} introuvables · ` +
        `${data.files_no_year.toLocaleString('fr')} sans année)`
      : '';
  }

  if (loadError) {
    list.innerHTML = `<p class="years-empty">Chargement impossible : ${esc(loadError)}</p>`;
    return;
  }
  if (!data) return;
  if (focusIndex >= data.a_revue.length) focusIndex = data.a_revue.length - 1;

  // ── Certaines : lecture seule, dédupliquées par clé ────────────────────
  const seen = new Map<string, { f: YearFile; n: number }>();
  for (const f of data.certaines) {
    const k = keyOf(f);
    const e = seen.get(k);
    if (e) e.n += 1;
    else seen.set(k, { f, n: 1 });
  }
  const certTitle = document.createElement('div');
  certTitle.className = 'years-section ok';
  certTitle.textContent = `✓ Certaines — prêtes pour scripts/apply_years.py (${seen.size.toLocaleString('fr')} morceaux)`;
  list.appendChild(certTitle);
  if (seen.size === 0) {
    list.insertAdjacentHTML('beforeend', '<p class="years-empty">Aucune année certaine dans les caches.</p>');
  }
  let nVisible = 0; // cartes listées (certaines + à revue) sous filtre
  for (const { f, n } of seen.values()) {
    if (!subjectMatches(YEARS_SCOPE, subjectFromName(`${f.artist ?? '?'} — ${f.title}`))) continue;
    nVisible += 1;
    const card = document.createElement('div');
    card.className = 'years-card';
    const suffix = n > 1 ? ` · ${n} fichiers` : '';
    card.innerHTML =
      `<span class="years-year">✓ ${esc(f.year ?? '?')}</span> — ` +
      `${esc(f.artist ?? '?')} — ${esc(f.title)}${suffix}`;
    card.title = f.path;
    card.prepend(playBtn(f.path, f.filename));
    list.appendChild(card);
  }

  // ── À revue : cartes interactives ──────────────────────────────────────
  const revTitle = document.createElement('div');
  revTitle.className = 'years-section';
  revTitle.textContent = isFilterActive(YEARS_SCOPE)
    ? `? À revue — filtré (${data.a_revue.length.toLocaleString('fr')} fichiers au total)`
    : `? À revue — choisissez l'année ou rejetez (${data.a_revue.length.toLocaleString('fr')} fichiers)`;
  // Année de remplacement (champ libre) : appliquée à la carte focusée avant
  // export — utile pour trancher vite une ambiguïté hors candidates.
  const input = document.createElement('input');
  input.id = 'years-year-input';
  input.className = 'years-export-input';
  input.placeholder = 'année pour la carte focusée…';
  input.title = 'Année (4 chiffres) appliquée à la carte focusée avant export';
  input.setAttribute('inputmode', 'numeric');
  input.setAttribute('maxlength', '4');
  input.value = replaceYear;
  input.onclick = (e): void => e.stopPropagation();
  input.oninput = (): void => {
    input.value = input.value.replace(/[^0-9]/g, '').slice(0, 4);
    replaceYear = input.value;
  };
  input.onkeydown = (e): void => {
    e.stopPropagation(); // saisie isolée du clavier de page
    if (e.key === 'Enter') {
      e.preventDefault();
      void exportChoices();
    }
  };
  revTitle.appendChild(input);
  const exportBtn = document.createElement('button');
  exportBtn.id = 'years-export';
  exportBtn.className = 'years-btn years-export';
  exportBtn.textContent = `💾 Exporter (${choices.size})`;
  exportBtn.title = 'Persiste les choix dans data/year_review.json — consommé par scripts/apply_years.py --review';
  exportBtn.onclick = (e): void => {
    e.stopPropagation();
    void exportChoices();
  };
  revTitle.appendChild(exportBtn);
  list.appendChild(revTitle);
  if (data.a_revue.length === 0) {
    list.insertAdjacentHTML(
      'beforeend',
      '<p class="years-empty">Rien à revir — toutes les ambiguïtés sont tranchées (ou absentes).</p>',
    );
  }
  data.a_revue.forEach((f, i) => {
    const k = keyOf(f);
    if (choices.get(k) === null) return; // rejeté → masqué (session)
    if (!reviewMatches(f)) return; // hors filtre
    nVisible += 1;
    const card = document.createElement('div');
    card.className = `years-card years-review${i === focusIndex ? ' focused' : ''}`;
    card.dataset.index = String(i);

    const head = document.createElement('div');
    head.className = 'years-card-title';
    const badge = f.status === 'lax' ? 'lax' : 'ambigu';
    head.innerHTML = `? ${esc(f.artist ?? '?')} — ${esc(f.title)} ` + `<span class="years-badge">${badge}</span>`;
    head.title = `${f.path} — source : ${f.source ?? '?'}`;
    head.prepend(playBtn(f.path, f.filename));
    card.appendChild(head);

    const cands = document.createElement('div');
    cands.className = 'years-cands';
    const opts: Array<{ y: string; label: string }> = [];
    if (f.status === 'lax' && f.year) {
      opts.push({ y: f.year, label: `✓ ${f.year} (lax)` });
    } else {
      for (const y of [...f.years].sort()) opts.push({ y, label: y });
    }
    for (const o of opts) {
      const b = document.createElement('button');
      b.className = `years-btn${choices.get(k) === o.y ? ' chosen' : ''}`;
      b.textContent = o.label;
      b.title = `Choisir ${o.y} comme année de première sortie`;
      b.onclick = (e): void => {
        e.stopPropagation();
        choices.set(k, o.y);
        renderYears();
      };
      cands.appendChild(b);
    }
    const rej = document.createElement('button');
    rej.className = 'years-btn years-reject';
    rej.textContent = '✗ Rejeter';
    rej.title = 'Aucune candidate ne convient (masqué pour la session)';
    rej.onclick = (e): void => {
      e.stopPropagation();
      choices.set(k, null);
      renderYears();
    };
    cands.appendChild(rej);
    card.appendChild(cands);

    card.onclick = (): void => {
      focusIndex = i;
      paintFocus();
    };
    list.appendChild(card);
  });
  // Compteur du chip : cartes listées / cartes totales (certaines dédupliquées
  // + à revue) — les rejetés (masqués par design) restent comptés au total.
  updateFilterCount(YEARS_SCOPE, nVisible, seen.size + data.a_revue.length);
}

function paintFocus(): void {
  const list = document.getElementById('years-list');
  if (!list) return;
  list.querySelectorAll('.years-card.focused').forEach(el => {
    el.classList.remove('focused');
  });
  const target = list.querySelector(`.years-card[data-index="${focusIndex}"]`);
  if (target) {
    target.classList.add('focused');
    target.scrollIntoView({ block: 'nearest' });
  }
}

export function yearsMoveFocus(delta: number): void {
  // Ordre VISIBLE : le focus saute les cartes hors filtre (et les rejetées,
  // déjà absentes du DOM). Hors liste filtrée : entrer par le début (↓) ou
  // la fin (↑).
  const vis: number[] = [];
  data?.a_revue.forEach((f, i) => {
    if (choices.get(keyOf(f)) !== null && reviewMatches(f)) vis.push(i);
  });
  if (vis.length === 0) return;
  let pos = vis.indexOf(focusIndex);
  if (pos === -1) pos = delta > 0 ? -1 : vis.length;
  pos = Math.min(Math.max(pos + delta, 0), vis.length - 1);
  focusIndex = vis[pos];
  paintFocus();
}

// ── Open / close : pages du routeur, pas de modal ─────────────────────────

export async function openYearsMode(): Promise<void> {
  goPage('years');
  focusIndex = -1; // ouverture = vue fraîche (pas de focus hérité)
  const statusText = document.getElementById('status-text');
  if (statusText) {
    statusText.textContent =
      '📅 Vue Années — ↑↓ naviguer · clic = choisir/rejeter · e = exporter · F7 ou / = filtrer · ' +
      'Échap revenir. Export = choix persistés (year_review.json) → scripts/apply_years.py --review.';
  }
  await refreshYears();
  await loadChoices();
  renderYears();
}

export function closeYearsMode(): void {
  goPage('sync');
}
