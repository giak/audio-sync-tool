import { beforeEach, describe, expect, it } from 'vitest';
import { setStatus } from './feedback.js';

describe('setStatus', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('écrit dans #status-text quand il existe', () => {
    const el = document.createElement('div');
    el.id = 'status-text';
    document.body.appendChild(el);
    setStatus('Prêt.');
    expect(el.textContent).toBe('Prêt.');
  });

  it('est un no-op sûr quand #status-text est absent', () => {
    expect(() => setStatus('Sans cible')).not.toThrow();
  });

  it('remplace le contenu précédent', () => {
    const el = document.createElement('div');
    el.id = 'status-text';
    el.textContent = 'ancien';
    document.body.appendChild(el);
    setStatus('nouveau');
    expect(el.textContent).toBe('nouveau');
  });
});
