# static/src/ — Architecture et modules core (EPIC-036)

Code applicatif vanilla TypeScript, bundlé par esbuild. Doc d'architecture complète :
`docs/refactoring/2026-09-19-refactoring-architecture.md` · registre EPIC :
`docs/superpowers/epics/`.

## Organisation

```
static/src/
├── core/          helpers transversaux (contrats ci-dessous) — EPIC-036 Phase 1
├── state.ts       source de vérité unique + EventEmitter (on/emit, batch rAF)
├── render/        une page = un module (eparsUI, sourceTree, playlistUI, yearsUI,
│                  dupsUI) + cellules (fileRow, styleCell…) ; cueEditor = isolé
├── commands/      registry clavier + matrice de caractérisation (EPIC-031)
├── domains        styles.ts, styleSuggest.ts, filterEngine.ts, dupDetect.ts,
│                  dupGroups.ts, utils.ts — modules métier purs, sans DOM
├── styles/        CSS en couches (EPIC-036 P3) : tokens · base · components ·
│                  pages/ (index.css = agrégateur, l'ordre des @import EST la
│                  cascade) — importé par script.ts, bundlé esbuild → dist/script.css
└── script.ts      point d'entrée (imports des commands EN ORDRE : index matrice)
```

## Modules core — contrats

| Module | API | Contrat |
|---|---|---|
| `core/format.ts` | `fmtCount(n)` · `plural(n, word, pl?)` · `byCountThenId(a, b)` | Formatage fr-FR partagé. `plural` : pluriel si n > 1 (0 = singulier, comportement historique des sites d'origine). Interdits hors core/ : `x.toLocaleString('fr')` à la main, pluriel fait main. |
| `core/feedback.ts` | `setStatus(msg)` | Barre d'état `#status-text`, no-op sûr si absente. Sémantique des canaux : **status = guidage**, **toast = confirmation d'action**, **dialog = décision** — ne pas croiser. |
| `core/subscribe.ts` | `subscribeVisible(event, containerId, render)` | S'abonne à un événement `:changed` du state et ne render que si le conteneur n'a pas `.hidden`. Renvoie la fonction de désabonnement (contrat `on()`). |
| `core/dom.ts` | `beginRender(container)` → `restore(el)` · `appendPanelEmpty(container, msg)` | Wipe + save/restore du scrollTop (différé rAF). `restore` est no-op si le nœud a été détaché. Usage : `const restore = beginRender(c); …build…; restore(c);`. `appendPanelEmpty` ajoute le bandeau d'état vide standard (EPIC-014). |

## Règle d'extraction (YAGNI)

Un module `core/` n'est créé que s'il remplace **≥ 2 implémentations existantes**
écrites, avec les tests verts avant **et** après. Pas d'abstraction anticipée :
tout nouveau module passe par une EPIC (registre `docs/superpowers/epics/`).

## Exemple — nouvelle page sur le pattern établi

```ts
import { setStatus } from '../core/feedback.js';
import { fmtCount, plural } from '../core/format.js';
import { beginRender } from '../core/dom.js';
import { subscribeVisible } from '../core/subscribe.js';

export function renderMaPage(): void {
  const container = document.getElementById('ma-page-container');
  if (!container) return;
  const restore = beginRender(container); // wipe + scroll mémorisé
  container.appendChild(makeRow(plural(state.items.length, 'élément')));
  restore(container);
}

// Ailleurs (boot) : re-render auto si des données changent pendant que la page est visible
subscribeVisible('items:changed', 'ma-page-container', renderMaPage);
```
