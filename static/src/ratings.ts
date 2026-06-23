// ─── Ratings CRUD: per-file rating (0-100) with optimistic update ─────────

import { api } from './api.js';
import { state } from './state.js';

/**
 * Load all ratings from server into state.ratings.
 * Called on app init (in initApp) and after any save.
 */
export async function loadRatings(): Promise<void> {
  state.ratings = await api<Record<string, number>>('/ratings');
}

/**
 * Get the rating for a specific file. Returns number or undefined.
 */
export function getRating(fullPath: string): number | undefined {
  return state.ratings[fullPath];
}

/**
 * Save a single rating. Updates state.ratings optimistically.
 * Rolls back on network/server error.
 * @returns true if saved successfully, false on error.
 */
export async function saveRating(fullPath: string, value: number): Promise<boolean> {
  if (!Number.isInteger(value) || value < 0 || value > 100) return false;

  // Snapshot for rollback
  const previous = state.ratings[fullPath];

  // Optimistic update
  state.ratings[fullPath] = value;

  try {
    const res = await api<{ ok: boolean }>('/ratings', {
      method: 'PUT',
      body: JSON.stringify({ [fullPath]: value }),
    });

    if (!res.ok) {
      // Server error — rollback
      if (previous !== undefined) {
        state.ratings[fullPath] = previous;
      } else {
        delete state.ratings[fullPath];
      }
      return false;
    }
    return true;
  } catch (_err) {
    // Network error — rollback optimistic update
    if (previous !== undefined) {
      state.ratings[fullPath] = previous;
    } else {
      delete state.ratings[fullPath];
    }
    return false;
  }
}

/**
 * Remove a rating for the given fullPath.
 * Sends a PUT with null value to the server.
 */
export async function deleteRating(fullPath: string): Promise<boolean> {
  const previous = state.ratings[fullPath];
  delete state.ratings[fullPath];

  try {
    const res = await api<{ ok: boolean }>('/ratings', {
      method: 'PUT',
      body: JSON.stringify({ [fullPath]: null }),
    });

    if (!res.ok) {
      // Server error — rollback
      if (previous !== undefined) {
        state.ratings[fullPath] = previous;
      }
      return false;
    }
    return true;
  } catch (_err) {
    // Network error — rollback optimistic delete
    if (previous !== undefined) {
      state.ratings[fullPath] = previous;
    }
    return false;
  }
}
