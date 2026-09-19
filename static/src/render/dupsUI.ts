// ─── Vue Doublons (EPIC-028 P2/v2) : 3e page du routeur goPage ────────────
// Ni modal, ni overlay : une page comme Sync et Playlist. Le clavier est
// scopé page via le registry (bindings page:'dups' de commands/dups.ts) —
// le confirmDialog reste une vraie modal AU-DESSUS de la page, sans conflit.
//
// v2 — groupes de versions (dupGroups.ts) : chaque carte = un morceau avec
// N exemplaires ; gagnant ✓ arbitré par qualité, override au clic sur un
// membre, application du plan (gagnant épars → copié, rangés perdants → trash).

import { applyGroupPlan, refreshDupMatches } from '../actions.js';
import { playingPath, togglePlay } from '../audio.js';
import { setStatus } from '../core/feedback.js';
import { fmtCount } from '../core/format.js';
import { buildVersionGroups, type VersionGroup } from '../dupGroups.js';
import { revalidateFocus } from '../focus.js';
import { goPage } from '../router.js';
import { on, state } from '../state.js';
import { confirmDialog } from '../ui.js';

let focusIndex = -1;
/** Override par groupe : groupKey → fullPath du membre que l'utilisateur désigne. */
const overrides = new Map<string, string>();
let groups: VersionGroup[] = [];

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── Helpers qualité (affichage fr) ────────────────────────────────────────

function memberLabel(m: VersionGroup['members'][number]): string {
  const side = m.side === 'epars' ? 'épars' : 'rangé';
  const version = m.sameRecording
    ? ''
    : ' <span class="dup-version" title="Autre version du même morceau (durée différente) — jamais déplacée automatiquement">≡ version</span>';
  return `${esc(m.filename)} <span class="dup-side">(${side} · ${esc(m.codec ?? 'codec ?')})</span>${version}`;
}

/** Bouton ▶ d'un membre (player bar globale, cf. sync) — écouter avant de
 * trancher. stopPropagation : un clic ▶ ne désigne JAMAIS le gagnant. */
function memberPlayBtn(m: VersionGroup['members'][number]): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'dup-play play-btn';
  b.textContent = '▶';
  b.title = `Écouter ${m.filename}`;
  b.dataset.path = m.fullPath;
  b.onclick = (e): void => {
    e.stopPropagation();
    togglePlay(m.filename, m.fullPath, b);
  };
  if (playingPath() === m.fullPath) {
    b.classList.add('playing');
    b.textContent = '⏹';
  }
  return b;
}

function groupTitle(g: VersionGroup): string {
  const base = g.winner.filename.replace(/\.[^.]+$/, '');
  const versions = g.members.filter(m => !m.sameRecording).length;
  const parts = [`${g.members.length} exemplaires`];
  if (versions > 0) parts.push(`${versions} versions`);
  return `${base} (${parts.join(' · ')})`;
}

// ── Render ────────────────────────────────────────────────────────────────

export function renderDups(): void {
  const list = document.getElementById('dups-list');
  if (!list) return;
  list.innerHTML = '';

  groups = buildVersionGroups(state.eparsFiles, state.sourceFiles);
  const count = document.getElementById('dups-count');
  if (count) {
    count.textContent =
      groups.length > 0
        ? `(${fmtCount(groups.length)} groupes · ${fmtCount(groups.reduce((n, g) => n + g.members.length, 0))} fichiers)`
        : '';
  }
  if (groups.length === 0) {
    list.innerHTML = '<p class="dups-empty">Aucun doublon potentiel — lance un scan si ce n\'est pas attendu.</p>';
    return;
  }
  if (focusIndex >= groups.length) focusIndex = groups.length - 1;

  groups.forEach((g, gi) => {
    const winner = overrides.get(g.key);
    const effectiveWinner = winner ? (g.members.find(m => m.fullPath === winner) ?? g.winner) : g.winner;

    const card = document.createElement('div');
    card.className = `dup-card${gi === focusIndex ? ' focused' : ''}`;
    card.dataset.index = String(gi);

    const h = document.createElement('div');
    h.className = 'dup-card-title';
    h.innerHTML = `↔ ${esc(groupTitle(g))}`;
    card.appendChild(h);

    const ul = document.createElement('div');
    ul.className = 'dup-members';
    for (const m of g.members) {
      const row = document.createElement('div');
      const isWinner = m.fullPath === effectiveWinner.fullPath;
      row.className = `dup-member ${m.side}${isWinner ? ' winner' : ''}`;
      row.title = `${m.fullPath} — ${isWinner ? 'gagnant (cliquer un autre pour override)' : 'clic = désigner gagnant'}`;
      row.innerHTML = `${isWinner ? '✓ ' : '&nbsp;&nbsp;'}${memberLabel(m)}`;
      row.onclick = (): void => {
        overrides.set(g.key, m.fullPath);
        renderDups();
      };
      row.prepend(memberPlayBtn(m));
      ul.appendChild(row);
    }
    card.appendChild(ul);

    const actions = document.createElement('div');
    actions.className = 'dup-card-actions';
    const apply = document.createElement('button');
    apply.className = 'dup-apply';
    apply.textContent = '✓ Appliquer (perdants → _trash)';
    apply.onclick = (e: MouseEvent): void => {
      e.stopPropagation();
      focusIndex = gi;
      paintFocus();
      // Override réel = désignation utilisateur dans la Map (sinon null = gagnant arbitré)
      applyGroup(overrides.get(g.key) ?? null);
    };
    actions.appendChild(apply);
    card.appendChild(actions);

    card.onclick = (): void => {
      focusIndex = gi;
      paintFocus();
    };
    list.appendChild(card);
  });
}

function paintFocus(): void {
  const list = document.getElementById('dups-list');
  if (!list) return;
  list.querySelectorAll('.dup-card.focused').forEach(el => {
    el.classList.remove('focused');
  });
  const target = list.querySelector(`.dup-card[data-index="${focusIndex}"]`);
  if (target) {
    target.classList.add('focused');
    target.scrollIntoView({ block: 'nearest' });
  }
}

/** Confirmation + application du plan pour le groupe focusé. */
function applyGroup(overridePath: string | null): void {
  const g = groups[focusIndex];
  if (!g) return;
  confirmDialog(
    `Groupe « ${groupTitle(g)} » :\n` +
      `le gagnant désigné est conservé, les autres exemplaires RANGÉS de même enregistrement vont dans _trash (jamais effacés).` +
      (g.members.some(m => !m.sameRecording)
        ? `\nLes autres VERSIONS du morceau (durées différentes) ne sont pas touchées.`
        : '') +
      ` Continuer ?`,
    () => {
      void applyGroupPlan(g, overridePath);
    },
    'Appliquer',
  );
}

// ── Open / close : pages du routeur, pas de modal ─────────────────────────

export function openDupsMode(): void {
  refreshDupMatches(); // garde le badge ambre de la page sync cohérent
  focusIndex = -1;
  overrides.clear();
  renderDups();
  goPage('dups');
  setStatus('↔ Vue Doublons — ↑↓ groupes · clic membre = override · R appliquer · Échap revenir.');
}

export function closeDupsMode(): void {
  goPage('sync');
  requestAnimationFrame(() => revalidateFocus());
}

export function dupsMoveFocus(delta: number): void {
  if (groups.length === 0) return;
  focusIndex = Math.min(Math.max(focusIndex + delta, 0), groups.length - 1);
  paintFocus();
}

/** R : applique le plan du groupe focusé (override pris en compte). */
export function dupsApplyFocused(): void {
  if (focusIndex < 0 || !groups[focusIndex]) return;
  const g = groups[focusIndex];
  const override = overrides.get(g.key) ?? null;
  applyGroup(override);
}

// ── Events ───────────────────────────────────────────────────────────────

// Remplacement fait depuis la vue → re-render pour refléter le nouveau verdict.
on('sourceFiles:changed', () => {
  if (state.page === 'dups') renderDups();
});
