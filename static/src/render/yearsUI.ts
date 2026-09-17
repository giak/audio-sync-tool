// ─── Vue Années manquantes (EPIC-033 T2/T4) : 4e page du routeur goPage ────
// Revue humaine des vagues à revue (ambiguïtés : bouton par candidate ; lax :
// accepter/rejeter). Les « certaines » sont listées pour info — l'ÉCRITURE
// réelle des tags reste faite par scripts/apply_years.py (jamais l'UI, pattern
// preview → confirmation). Les choix faits ici ne sont que locaux (session) :
// ils préfigurent la revue, ils ne modifient ni fichiers ni caches.
//
// Données : GET /years/preview (app.py) — consolidation MB/Deezer → Discogs →
// iTunes sans double comptage ; introuvables = simple compteur (aucune action).

import { api } from '../api.js';
import { goPage } from '../router.js';

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

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/** Clé de cache (artiste\titre) d'un fichier — identifiant de choix. */
function keyOf(f: YearFile): string {
  return `${f.artist ?? ''}\t${f.title}`;
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
  for (const { f, n } of seen.values()) {
    const card = document.createElement('div');
    card.className = 'years-card';
    const suffix = n > 1 ? ` · ${n} fichiers` : '';
    card.innerHTML =
      `<span class="years-year">✓ ${esc(f.year ?? '?')}</span> — ` +
      `${esc(f.artist ?? '?')} — ${esc(f.title)}${suffix}`;
    card.title = f.path;
    list.appendChild(card);
  }

  // ── À revue : cartes interactives ──────────────────────────────────────
  const revTitle = document.createElement('div');
  revTitle.className = 'years-section';
  revTitle.textContent = `? À revue — choisissez l'année ou rejetez (${data.a_revue.length.toLocaleString('fr')} fichiers)`;
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
    const card = document.createElement('div');
    card.className = `years-card years-review${i === focusIndex ? ' focused' : ''}`;
    card.dataset.index = String(i);

    const head = document.createElement('div');
    head.className = 'years-card-title';
    const badge = f.status === 'lax' ? 'lax' : 'ambigu';
    head.innerHTML = `? ${esc(f.artist ?? '?')} — ${esc(f.title)} ` + `<span class="years-badge">${badge}</span>`;
    head.title = `${f.path} — source : ${f.source ?? '?'}`;
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
  const n = data?.a_revue.length ?? 0;
  if (n === 0) return;
  focusIndex = Math.min(Math.max(focusIndex + delta, 0), n - 1);
  paintFocus();
}

// ── Open / close : pages du routeur, pas de modal ─────────────────────────

export async function openYearsMode(): Promise<void> {
  goPage('years');
  const statusText = document.getElementById('status-text');
  if (statusText) {
    statusText.textContent =
      '📅 Vue Années — ↑↓ naviguer · clic = choisir/rejeter · Échap revenir. ' +
      'Choix de session : l\u2019écriture des tags reste scripts/apply_years.py.';
  }
  await refreshYears();
  renderYears();
}

export function closeYearsMode(): void {
  goPage('sync');
}
