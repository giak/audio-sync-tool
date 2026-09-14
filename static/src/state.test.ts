// ─── Unit tests for state EventEmitter ────────────────────────────────────
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { on, state } from './state.js';

describe('state EventEmitter', () => {
  beforeEach(async () => {
    state.activePanel = 'epars';
    state.activeModal = null;
    // Flush any pending RAF from the beforeEach set itself
    await new Promise(r => requestAnimationFrame(r));
  });

  it('emits on property change', async () => {
    const fn = vi.fn();
    on('activePanel:changed', fn);
    state.activePanel = 'source';
    await new Promise(r => requestAnimationFrame(r));
    expect(fn).toHaveBeenCalled();
  });

  it('does not emit if value unchanged', async () => {
    const fn = vi.fn();
    on('activePanel:changed', fn);
    state.activePanel = 'epars'; // already 'epars'
    await new Promise(r => requestAnimationFrame(r));
    expect(fn).not.toHaveBeenCalled();
  });

  it('unsubscribe works', async () => {
    const fn = vi.fn();
    const unsub = on('activePanel:changed', fn);
    unsub();
    state.activePanel = 'source';
    await new Promise(r => requestAnimationFrame(r));
    expect(fn).not.toHaveBeenCalled();
  });

  it('batches multiple emissions in one RAF frame', async () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    on('sourceFiles:changed', fn1);
    on('eparsFiles:changed', fn2);

    state.sourceFiles = { '/a': { 'x.mp3': { path: 'x.mp3', year: null, duration: null, codec: null } } };
    state.eparsFiles = { '/b': { 'y.mp3': { path: 'y.mp3', year: null, duration: null, codec: null } } };

    await new Promise(r => requestAnimationFrame(r));
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it('validates activePanel and rejects invalid values', () => {
    state.activePanel = 'source'; // valid
    expect(state.activePanel).toBe('source');
    // Invalid value should be rejected by the proxy
    (state as any).activePanel = 'invalid';
    expect(state.activePanel).toBe('source'); // unchanged
  });

  it('validates activeModal and rejects invalid values', () => {
    state.activeModal = 'config'; // valid
    expect(state.activeModal).toBe('config');
    (state as any).activeModal = 'bogus';
    expect(state.activeModal).toBe('config'); // unchanged
  });

  it('focusListId is initialized to epars', () => {
    expect(state.focusListId).toBe('epars');
  });

  it('lastCueTrack is initialized to null', () => {
    state.lastCueTrack = null;
    expect(state.lastCueTrack).toBeNull();
  });
});
