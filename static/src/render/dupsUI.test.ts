// ─── Unit tests: render/dupsUI.ts — vue Doublons v2 (groupes) ─────────────
// actions.js et focus.js mockés ; router.js RÉEL (exclusivité des pages).
// jsdom n'a pas scrollIntoView → stub sur Element.prototype (pattern connu).

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { revalidateFocus, applyGroupPlan, refreshDupMatches, togglePlay, playingPath } = vi.hoisted(() => ({
  revalidateFocus: vi.fn(),
  applyGroupPlan: vi.fn(),
  refreshDupMatches: vi.fn(),
  togglePlay: vi.fn(),
  playingPath: vi.fn<[], string | null>(() => null),
}));

vi.mock('../focus.js', () => ({ revalidateFocus }));
vi.mock('../actions.js', () => ({ applyGroupPlan, refreshDupMatches }));
vi.mock('../audio.js', () => ({
  togglePlay,
  playingPath,
  stopPlayer: vi.fn(),
  seekAudio: vi.fn(),
  isAudioPlaying: vi.fn(() => false),
  initAudioUI: vi.fn(),
}));

import { state } from '../state.js';
import { closeDupsMode, dupsApplyFocused, dupsMoveFocus, openDupsMode, renderDups } from './dupsUI.js';

function setupDom(): void {
  document.body.innerHTML = `
    <div id="main-panels"></div>
    <div id="playlist-layout" class="hidden"></div>
    <div id="dups-layout" class="hidden">
      <h2>↔ Doublons <span id="dups-count"></span></h2>
      <div id="dups-list"></div>
    </div>
    <div id="page-nav">
      <button id="page-sync" class="page-btn active">📦 Sync</button>
      <button id="page-playlist" class="page-btn">🎵 Playlist</button>
      <button id="page-dups" class="page-btn">↔ Doublons</button>
    </div>
    <div id="status-text"></div>
    <div id="modal-dialog" class="modal hidden">
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <div class="modal-header"><h3>Confirm</h3></div>
        <div id="dialog-msg"></div>
        <button id="dialog-confirm">OK</button>
        <button id="dialog-cancel">Annuler</button>
      </div>
    </div>
  `;
  Element.prototype.scrollIntoView = vi.fn();
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDom();
  state.page = 'sync';
  state.playlistMode = false;
  state.eparsFiles = {
    '/e': {
      'song.flac': { path: 'song.flac', duration: 200, codec: 'FLAC' },
      'other.mp3': { path: 'other.mp3', duration: 500, codec: 'MP3 128kbps' },
    },
  };
  state.sourceFiles = {
    '/s': {
      'song.mp3': { path: 'song.mp3', duration: 200, codec: 'MP3 320kbps' },
      'other.mp3': { path: 'other.mp3', duration: 500, codec: 'MP3 320kbps' },
    },
  };
});

afterAll(() => {
  document.body.innerHTML = '';
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

/** Groupe attendu avec cette fixture : other.mp3 (2 exemplaires) et song (2). */
function expectCards(n: number): void {
  const cards = document.querySelectorAll('.dup-card');
  expect(cards.length).toBe(n);
  return;
}

describe('dupsUI v2 (groupes)', () => {
  it('renders one card per version-group with winner marked', () => {
    openDupsMode();
    expectCards(2);

    const songCard = [...document.querySelectorAll('.dup-card')].find(c => c.textContent?.includes('song'))!;
    const winnerRow = songCard.querySelector('.dup-member.winner')!;
    expect(winnerRow.textContent).toContain('song.flac'); // FLAC gagne sur MP3 320
    expect(songCard.innerHTML).toContain('épars');
    expect(songCard.innerHTML).toContain('rangé');
  });

  it('clicking a member overrides the winner', () => {
    openDupsMode();
    const songCard = [...document.querySelectorAll('.dup-card')].find(c =>
      c.textContent?.includes('song (2 exemplaires)'),
    )!;
    const mp3Row = [...songCard.querySelectorAll('.dup-member')].find(r => r.textContent?.includes('song.mp3'))!;
    mp3Row.click();
    vi.waitFor(() => {
      expect(songCard.querySelector('.dup-member.winner')!.textContent).toContain('song.mp3');
    });
  });

  it('apply button calls applyGroupPlan with the group and override', async () => {
    const { applyGroupPlan: mockedApply } = await import('../actions.js');
    openDupsMode();
    const songCard = [...document.querySelectorAll('.dup-card')].find(c =>
      c.textContent?.includes('song (2 exemplaires)'),
    )!;
    const mp3Row = [...songCard.querySelectorAll('.dup-member')].find(r => r.textContent?.includes('song.mp3'))!;
    mp3Row.click(); // override
    const applyBtn = songCard.querySelector('.dup-apply') as HTMLButtonElement;
    applyBtn.click();

    // confirmDialog réel → modal-dialog doit exister et être ouvert ; on confirme
    const confirmBtn = document.getElementById('dialog-confirm');
    expect(confirmBtn).not.toBeNull();
    confirmBtn!.click();

    expect(vi.mocked(mockedApply)).toHaveBeenCalledTimes(1);
    const [group, override] = vi.mocked(mockedApply).mock.calls[0];
    expect(group.winner.filename).toBe('song.flac');
    // fullPath membre rangé = dir + '/' + relPath (convention dupDetect)
    expect(override).toBe('/s/song.mp3');
  });

  it('apply button uses the arbitrated winner without override', async () => {
    await import('../actions.js');
    openDupsMode();
    const songCard = [...document.querySelectorAll('.dup-card')].find(c =>
      c.textContent?.includes('song (2 exemplaires)'),
    )!;
    (songCard.querySelector('.dup-apply') as HTMLButtonElement).click();
    document.getElementById('dialog-confirm')!.click();

    const [, override] = vi.mocked(applyGroupPlan).mock.calls[0];
    expect(override).toBeNull();
  });

  it('keyboard focus paints one card and R applies the focused group', async () => {
    openDupsMode();
    dupsMoveFocus(1); // → carte 0
    expect(document.querySelector('.dup-card.focused')).not.toBeNull();

    dupsApplyFocused();
    document.getElementById('dialog-confirm')!.click();
    expect(vi.mocked(applyGroupPlan)).toHaveBeenCalledTimes(1);
  });

  it('close : retour page sync exclusive', () => {
    openDupsMode();
    closeDupsMode();

    expect(state.page).toBe('sync');
    expect(document.getElementById('dups-layout')!.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('main-panels')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('page-sync')!.classList.contains('active')).toBe(true);
    expect(document.getElementById('page-dups')!.classList.contains('active')).toBe(false);
  });

  it('open : page exclusive + bouton .active exclusif', () => {
    openDupsMode();

    expect(state.page).toBe('dups');
    expect(document.getElementById('dups-layout')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('main-panels')!.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('page-dups')!.classList.contains('active')).toBe(true);
    expect(document.getElementById('page-sync')!.classList.contains('active')).toBe(false);
  });

  it('empty state when no groups', () => {
    state.eparsFiles = { '/e': {} };
    state.sourceFiles = { '/s': {} };
    renderDups();
    expect(document.querySelector('.dups-empty')).not.toBeNull();
  });
});

describe('dupsUI player audio', () => {
  it('chaque membre a un bouton ▶ ; clic = togglePlay SANS override du gagnant', () => {
    playingPath.mockReturnValue(null);
    openDupsMode();
    // 2 groupes × 2 membres = 4 boutons ▶
    expect(document.querySelectorAll('.dup-play').length).toBe(4);
    const songCard = [...document.querySelectorAll('.dup-card')].find(c => c.textContent?.includes('song'))!;
    const mp3Row = [...songCard.querySelectorAll('.dup-member')].find(r => r.textContent?.includes('song.mp3'))!;
    const btn = mp3Row.querySelector('.dup-play') as HTMLButtonElement;
    btn.click();
    expect(togglePlay).toHaveBeenCalledTimes(1);
    const [fn, path] = togglePlay.mock.calls[0];
    expect(fn).toBe('song.mp3');
    expect(path).toBe('/s/song.mp3');
    // le clic ▶ ne change PAS le gagnant (stopPropagation)
    renderDups();
    const winner = [...document.querySelectorAll('.dup-card')]
      .find(c => c.textContent?.includes('song'))!
      .querySelector('.dup-member.winner')!;
    expect(winner.textContent).toContain('song.flac');
  });

  it('bouton du membre en lecture re-marqué ⏹ après re-render', () => {
    playingPath.mockReturnValue('/e/song.flac');
    openDupsMode();
    const btn = document.querySelector('.dup-play[data-path="/e/song.flac"]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.classList.contains('playing')).toBe(true);
    expect(btn.textContent).toBe('⏹');
  });
});
