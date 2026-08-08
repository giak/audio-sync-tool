// ─── Rating inline edit: shared logic, sidebar + source tree entry points ──

import { deleteRating, getRating, saveRating } from '../ratings.js';
import { state } from '../state.js';
import { showToast } from '../ui.js';

let _ratingEditActive = false;

/** Reset internal state (for tests). */
export function resetRatingEditState(): void {
  _ratingEditActive = false;
}

/** Shared onclick handler for .pl-track-rating spans.
 *  Focuses the parent track, then opens the inline rating input. */
export function _ratingClickHandler(e: MouseEvent): void {
  e.stopPropagation();
  const target = e.currentTarget as HTMLElement | null;
  if (!target) return;
  const trackEl = target.closest('.pl-track') as HTMLElement | null;
  if (!trackEl) return;
  const tracksContainer = document.getElementById('playlist-tracks');
  if (tracksContainer) {
    tracksContainer.querySelectorAll('.pl-track.focused').forEach(f => {
      f.classList.remove('focused');
    });
  }
  trackEl.classList.add('focused');
  const panel = document.getElementById('playlist-panel');
  if (panel) {
    const allTracks = Array.from(panel.querySelectorAll('.pl-track'));
    state.playlistTrackFocusIndex = allTracks.indexOf(trackEl);
  }
  state.playlistFocus = 'sidebar';
  startRatingEdit();
}

export function startRatingEdit(): void {
  const focused = document.querySelector('#playlist-tracks .focused') as HTMLElement | null;
  if (!focused) return;
  const ratingSpan = focused.querySelector('.pl-track-rating') as HTMLElement | null;
  if (!ratingSpan) return;

  _startInlineRatingEdit(ratingSpan, (_fullPath, newRating) => {
    const span = document.createElement('span');
    span.className = 'pl-track-rating';
    span.dataset.fullpath = _fullPath;
    span.onclick = _ratingClickHandler;
    if (newRating !== undefined) {
      span.textContent = String(newRating);
    } else {
      const noneSpan = document.createElement('span');
      noneSpan.className = 'pl-track-rating-none';
      noneSpan.textContent = '—';
      span.appendChild(noneSpan);
    }
    return span;
  });
}

/** Inline rating edit on a focused file-row in the playlist source tree. */
export function startSourceRatingEdit(): void {
  const focused = document.querySelector('#playlist-source-container .file-row.focused') as HTMLElement | null;
  if (!focused) {
    showToast('ℹ️ ↑↓ pour focuser un fichier, puis N pour noter.');
    return;
  }
  const ratingSpan = focused.querySelector('.file-rating') as HTMLElement | null;
  if (!ratingSpan) return;

  _startInlineRatingEdit(ratingSpan, (_fullPath, newRating) => {
    const span = document.createElement('span');
    span.className = 'file-rating';
    span.dataset.fullpath = _fullPath;
    if (newRating !== undefined) span.textContent = String(newRating);
    span.onclick = (e: MouseEvent) => {
      e.stopPropagation();
      const cont = span.closest(
        '#epars-container, #source-container, #playlist-source-container',
      ) as HTMLElement | null;
      if (!cont) return;
      const row = span.closest('.file-row') as HTMLElement | null;
      if (row) {
        for (const el of cont.querySelectorAll('.focused')) el.classList.remove('focused');
        row.classList.add('focused');
        if (cont.id === 'playlist-source-container') startSourceRatingEdit();
      }
    };
    return span;
  });
}

/** Shared inline rating edit: replaces ratingSpan with input, handles
 *  commit/cancel/blur, then calls rebuildSpan to recreate the display. */
function _startInlineRatingEdit(
  ratingSpan: HTMLElement,
  rebuildSpan: (fullPath: string, newRating: number | undefined) => HTMLElement,
): void {
  if (_ratingEditActive) return;
  const fullPath = ratingSpan.dataset.fullpath || '';
  if (!fullPath) return;

  _ratingEditActive = true;

  const currentRating = getRating(fullPath);
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'pl-rating-input';
  input.maxLength = 3;
  input.value = currentRating !== undefined ? String(currentRating) : '';
  input.spellcheck = false;

  ratingSpan.replaceWith(input);
  input.focus();
  input.select();

  function commit(): void {
    const val = input.value.trim();
    if (val === '') {
      deleteRating(fullPath).catch(() => showToast('⚠️ Note non supprimée'));
    } else {
      const num = parseInt(val, 10);
      if (!Number.isNaN(num) && num >= 0 && num <= 100) {
        saveRating(fullPath, num).catch(() => showToast('⚠️ Note non sauvegardée'));
      }
    }
    finish();
  }

  function cancel(): void {
    finish();
  }

  function finish(): void {
    _ratingEditActive = false;
    const newRating = getRating(fullPath);
    const span = rebuildSpan(fullPath, newRating);
    input.replaceWith(span);
  }

  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  });

  input.addEventListener('blur', () => {
    if (!_ratingEditActive) return;
    const val = input.value.trim();
    if (val === '') {
      deleteRating(fullPath).catch(() => showToast('⚠️ Note non supprimée'));
    } else {
      const num = parseInt(val, 10);
      if (!Number.isNaN(num) && num >= 0 && num <= 100) {
        saveRating(fullPath, num).catch(() => showToast('⚠️ Note non sauvegardée'));
      }
    }
    finish();
  });
}
