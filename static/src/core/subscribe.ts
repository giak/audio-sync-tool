// ─── core/subscribe.ts — abonnement d'auto-render gardé (EPIC-036 P1) ─────
// Remplace le pattern répété de render.ts : s'abonner à un événement
// `:changed` du state et ne re-render que si le conteneur est visible.
// Le garde est subtil (bug latent si copié sans le comprendre, cf. étude
// §1.4) — il vit maintenant à un seul endroit, commenté.
import { on } from '../state.js';

/** S'abonne à `event` et appelle `render` quand il est émis, uniquement si
 *  l'élément `containerId` n'a pas la classe `hidden`. Renvoie la fonction
 *  de désabonnement (contrat identique à `on`). */
export function subscribeVisible(event: string, containerId: string, render: () => void): () => void {
  return on(event, () => {
    const container = document.getElementById(containerId);
    if (container && !container.classList.contains('hidden')) render();
  });
}
