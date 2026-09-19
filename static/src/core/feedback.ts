// ─── core/feedback.ts — barre d'état unique (EPIC-036 Phase 1) ────────────
// Remplace les 27 sites `document.getElementById('status-text')` + garde
// null + affectation textContent. Contrat : `setStatus(msg)` est un no-op
// sûr si #status-text est absent (le garde null existant est déplacé ici).
// Sémantique (étude §1.4) : status = guidage, toast = confirmation d'action,
// dialog = décision — setStatus ne remplace ni toast ni dialog.

/** Écrit `msg` dans la barre d'état (#status-text). No-op si absente. */
export function setStatus(msg: string): void {
  const el = document.getElementById('status-text');
  if (el) el.textContent = msg;
}
