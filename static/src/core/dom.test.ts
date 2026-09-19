import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginRender } from './dom.js';

// jsdom n'exécute pas les rAF via les fake timers : on capture les callbacks
// et on les exécute manuellement — le test pilote le temps, pas l'inverse.
function stubRaf(): FrameRequestCallback[] {
  const callbacks: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    callbacks.push(cb);
    return callbacks.length;
  });
  return callbacks;
}

function runRaf(callbacks: FrameRequestCallback[]): void {
  callbacks.splice(0).forEach(cb => {
    cb(0);
  });
}

describe('beginRender', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('wipe le contenu du conteneur', () => {
    stubRaf();
    const el = document.createElement('div');
    el.innerHTML = '<p>ancien</p>';
    beginRender(el);
    expect(el.innerHTML).toBe('');
  });

  it('sauvegarde le scrollTop avant le wipe et le restaure', () => {
    const raf = stubRaf();
    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollTop', { value: 250, writable: true });
    const restore = beginRender(el);
    expect(el.innerHTML).toBe('');
    restore(el);
    runRaf(raf);
    expect(el.scrollTop).toBe(250);
  });

  it('restaure le scrollTop dans un rAF (pas avant)', () => {
    const raf = stubRaf();
    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollTop', { value: 100, writable: true });
    const restore = beginRender(el);
    el.scrollTop = 0;
    restore(el);
    expect(el.scrollTop).toBe(0); // pas encore restauré (rAF différé)
    runRaf(raf);
    expect(el.scrollTop).toBe(100);
  });

  it("ne planifie qu'un seul rAF par restore", () => {
    const raf = stubRaf();
    const el = document.createElement('div');
    const restore = beginRender(el);
    restore(el);
    expect(raf).toHaveLength(1);
  });

  it('est no-op si le conteneur a été retiré entre-temps', () => {
    const raf = stubRaf();
    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollTop', { value: 90, writable: true });
    const restore = beginRender(el);
    el.remove();
    expect(() => {
      restore(el);
      runRaf(raf);
    }).not.toThrow();
    expect(el.scrollTop).toBe(90);
  });
});
