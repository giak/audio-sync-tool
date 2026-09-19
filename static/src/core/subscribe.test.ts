import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emit } from '../state.js';
import { subscribeVisible } from './subscribe.js';

// emit est batché via requestAnimationFrame : vitest-jsdom n'exécute pas les
// rAF spontanément — on pilote les timers manuellement.
function flushEmit(): void {
  vi.advanceTimersByTime(16);
}

describe('subscribeVisible', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  it("appelle render quand l'événement est émis et le conteneur visible", () => {
    const container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);
    const render = vi.fn();
    subscribeVisible('test:event', 'test-container', render);
    emit('test:event');
    flushEmit();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('ne render pas quand le conteneur a la classe hidden', () => {
    const container = document.createElement('div');
    container.id = 'test-hidden';
    container.classList.add('hidden');
    document.body.appendChild(container);
    const render = vi.fn();
    subscribeVisible('test:event', 'test-hidden', render);
    emit('test:event');
    flushEmit();
    expect(render).not.toHaveBeenCalled();
  });

  it('ne render pas quand le conteneur est absent', () => {
    const render = vi.fn();
    subscribeVisible('test:event', 'inexistant', render);
    emit('test:event');
    flushEmit();
    expect(render).not.toHaveBeenCalled();
  });

  it('redevient actif quand la classe hidden est retirée', () => {
    const container = document.createElement('div');
    container.id = 'test-toggle';
    container.classList.add('hidden');
    document.body.appendChild(container);
    const render = vi.fn();
    subscribeVisible('test:event', 'test-toggle', render);
    emit('test:event');
    flushEmit();
    expect(render).not.toHaveBeenCalled();
    container.classList.remove('hidden');
    emit('test:event');
    flushEmit();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('renvoie une fonction de désabonnement effective', () => {
    const container = document.createElement('div');
    container.id = 'test-unsub';
    document.body.appendChild(container);
    const render = vi.fn();
    const unsubscribe = subscribeVisible('test:event', 'test-unsub', render);
    unsubscribe();
    emit('test:event');
    flushEmit();
    expect(render).not.toHaveBeenCalled();
  });
});
