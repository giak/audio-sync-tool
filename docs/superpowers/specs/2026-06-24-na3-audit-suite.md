# NA3 — Suite de l'audit technique : undo/redo, async scan, virtual scrolling

**Date :** 24 juin 2026  
**Base :** Audit technique v0.2, 68 tests Python, 524 tests TypeScript, 82% func coverage  
**Référence :** `docs/superpowers/specs/2026-06-24-post-audit-improvements.md` (A↓B déjà implémenté)

---

## Résumé exécutif

Sur les 3 items restants de l'audit, **un seul est retenu** après analyse critique :

| # | Item | Verdict | Raison |
|---|------|---------|--------|
| B | Async scan (ProcessPoolExecutor) | ✅ **Implémenter** | ROI le plus élevé — seul blocage utilisateur restant |
| A | Undo/redo pour copies | ❌ Drop | Confirmation modale déjà en place, surcoût disproportionné |
| C | Virtual scrolling | ❌ Drop | Optimisation prématurée, `content-visibility: auto` déjà fait |

---

## B — Async background scan (ProcessPoolExecutor)

### Problème

Le scan (`/scan`) est synchrone et bloque le thread Flask pendant 30-60 secondes pour ~5 000 fichiers. L'utilisateur voit une barre de progression qui avance, mais le serveur est monopolisé. Si l'utilisateur ouvre un deuxième onglet pendant le scan, la requête `/ping` ou `/load` est mise en attente.

Le code actuel utilise `_scan_progress` comme dict global — fonctionne en single-worker Flask threadé, mais casserait avec Gunicorn multi-worker.

### Infrastruture existante

- `_scan_progress` : dict global pour tracking de progression
- `reset_scan_progress()` / `update_scan_progress()` : setters
- `/scan-progress` : endpoint GET pour polling (frontend appelle toutes les 400ms)
- `index_files(directory)` : parcourt `os.walk()`, appelle `get_audio_meta()` sur chaque fichier
- `get_audio_meta()` : lit les metadata via mutagen (CPU + I/O)

### Solution

Déléguer `index_files()` à un `ProcessPoolExecutor` pour paralléliser les appels `get_audio_meta()`. Le scan global reste séquentiel (un dossier après l'autre), mais l'extraction des métadonnées à l'intérieur d'un dossier est parallélisée.

#### Approche recommandée

```python
from concurrent.futures import ProcessPoolExecutor, as_completed
import multiprocessing

def _scan_file(path, rel_path):
    """Worker function — called in child process."""
    year, duration, codec = get_audio_meta(path)
    return (os.path.basename(path), {
        'path': rel_path,
        'year': year,
        'duration': duration,
        'codec': codec,
    })

def index_files(directory, phase_label='source'):
    index = {}
    if not os.path.isdir(directory):
        return index
    # Collect file list
    tasks = []
    for root, dirs, files in os.walk(directory):
        for f in files:
            if f.lower().endswith(MUSIC_EXTENSIONS):
                full_path = os.path.join(root, f)
                rel = os.path.relpath(root, directory)
                rel_path = os.path.join(rel, f) if rel != '.' else f
                tasks.append((full_path, rel_path, f))
    total = len(tasks)
    update_scan_progress(phase_label, '🔍 Indexation…', 0, total)

    workers = max(1, multiprocessing.cpu_count() - 1)  # leave 1 core free
    with ProcessPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(_scan_file, path, rel_path): filename
            for path, rel_path, filename in tasks
        }
        current = 0
        for future in as_completed(futures):
            filename, entry = future.result()
            index[filename] = entry
            current += 1
            if current % 10 == 0 or current == total:
                update_scan_progress(phase_label, filename, current, total)
    return index
```

**Points clés :**

- `_scan_file()` est une fonction top-level (pas une closure) — pickle-safe pour `ProcessPoolExecutor`
- `get_audio_meta()` est appelée dans les processus enfants, pas dans le thread Flask principal
- `HAS_MUTAGEN` est vérifié dans chaque worker (le module est importé par chaque processus)
- La progression est mise à jour par le processus parent via `as_completed()`
- `max_workers = cpu_count - 1` évite de saturer la machine
- Pour les petites bibliothèques (< 100 fichiers), l'overhead de spawn des processus pourrait être contre-productif → fallback séquentiel si `total < 100`

#### Fallback séquentiel

```python
if total < 100:
    # Sequential for small libraries — process pool overhead isn't worth it
    current = 0
    for full_path, rel_path, filename in tasks:
        current += 1
        year, duration, codec = get_audio_meta(full_path)
        index[filename] = {'path': rel_path, 'year': year, 'duration': duration, 'codec': codec}
        if current % 10 == 0 or current == total:
            update_scan_progress(phase_label, filename, current, total)
    return index
```

### Impact

| Aspect | Avant | Après |
|--------|-------|-------|
| Bloque Flask ? | Oui, thread entier | Non, processus séparés |
| Métadonnées parallélisées ? | Non, séquentiel | Oui, cpu_count-1 workers |
| Frontend changé ? | — | Aucun — même endpoint `/scan-progress` |
| Tests impactés ? | — | `index_files` doit être testable sans executor (mock) |

### Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `app.py` | Refactoring `index_files()` → `_scan_file()` top-level + `ProcessPoolExecutor` |
| `test_app.py` | Test `test_index_files_*` vérifient que l'executor produit le même résultat ; test avec taille < 100 pour forcer le fallback séquentiel |

### Risques

| Risque | Probabilité | Mitigation |
|--------|-------------|------------|
| `_scan_file` pas pickle-safe | Faible | Fonction top-level, pas de closure, pas d'état |
| Overhead processus > gain | Faible | Fallback séquentiel pour < 100 fichiers |
| `_scan_progress` dict global non thread-safe | Élevé | Remplacer par `threading.Lock` autour des writes (déjà thread-safe en pratique car un seul writer) |

### Coût estimé

- **Python :** ~60 lignes modifiées dans `app.py`
- **Tests :** ~10 lignes dans `test_app.py`
- **Frontend :** 0 changement
- **Effort :** 1 heure
- **Risque de régression :** Faible — l'API publique (`/scan`, `/scan-progress`) ne change pas

---

## A — Undo/Redo pour copies (DROP)

### Pourquoi drop ?

1. **La confirmation modale existe déjà.** Chaque F5 ouvre un dialog « Copier X vers Y ? » avec Entrée/Échap. L'erreur utilisateur est déjà mitigée.

2. **L'undo d'une copie fichier est non-trivial.** Il faut :
   - Supprimer le fichier copié du disque (`os.remove`)
   - Supprimer l'entrée du cache (`CACHE_PATH`)
   - Supprimer l'entrée du journal (`JOURNAL_PATH`)
   - Reverter l'état frontend (`sourceFiles`, `eparsFiles`)
   - Re-render les deux panneaux
   - Gérer le cas où le fichier a été modifié entre-temps

3. **Coût disproportionné** pour un outil solo :
   - ~200 lignes TS : `CopyCommand` avec `execute()`/`undo()`, `UndoManager` avec stack + limite
   - ~50 lignes Python : endpoint `POST /undo` pour la suppression fichier + rollback cache/journal
   - ~50 lignes de tests
   - Total : ~300 lignes de code pour une feature qui sera utilisée une fois par mois

4. **Ctrl+Z** est déjà utilisé pour l'audio (seek), pas pour l'undo de commande. Ajouter un undo global créerait une ambiguïté de scope.

5. **Pattern Command inexistant.** Le codebase n'a pas de Command Registry (le dispatch clavier est dans `script.ts` via un switch manuel). Implémenter un vrai pattern Command juste pour l'undo serait de l'over-engineering.

### Alternative plus simple

Si l'utilisateur copie un fichier au mauvais endroit, il peut :
1. Naviguer dans le panneau source data (droite)
2. Trouver le fichier mal placé
3. Le supprimer manuellement (pas de bouton « Supprimer » aujourd'hui, mais un `Delete` ajouté serait trivial : ~20 lignes)

Un endpoint `POST /delete` (supprime le fichier + nettoie le cache) serait une alternative beaucoup plus simple à l'undo complet. Coût : ~30 lignes Python + ~20 lignes TypeScript.

**Verdict :** À reconsidérer si l'outil devient multi-utilisateur ou si les erreurs de copie deviennent fréquentes. Pour l'instant, la confirmation modale + un éventuel bouton Delete suffisent.

---

## C — Virtual scrolling (DROP)

### Pourquoi drop ?

1. **Taille DOM réelle.** Pour une bibliothèque perso typique :
   - ~200 dossiers dans le panneau source data
   - ~10 fichiers par dossier en moyenne (seulement quand déplié)
   - Total : ~200 nœuds DOM (dossiers) + fichiers des dossiers dépliés
   - Même avec 5 000 fichiers, l'utilisateur ne déplie que quelques dossiers à la fois

2. **`content-visibility: auto` déjà en place.** Le CSS appliqué sur `.file-row` dit au navigateur de skip le rendu des nœuds hors viewport. C'est 90% du gain de perf sans complexité.

3. **La navigation clavier casse avec la virtualisation.** Le système de focus (`focus.ts`) utilise `querySelectorAll('.directory, .file-row')` pour trouver tous les éléments focusables. Si les nœuds sont virtualisés (absents du DOM), `ArrowUp/Down` ne peut pas les atteindre. Il faudrait :
   - Flatten l'arbre en liste plate
   - Maintenir un index virtuel
   - Intercepter ArrowUp/Down pour calculer le prochain index
   - Forcer le rendu de la cible avant de focus
   - Réécrire `navigateFocus()`, `focusItemByPath()`, `getItems()`, `navigateColumn()`

4. **Le rebuild complet est rare.** `renderSource()` avec `innerHTML = ''` n'est appelé qu'à l'init, au scan, et au toggle de filtre — pas à chaque interaction. Le toggle de dossier (`toggleSourceDir`) utilise `appendChild()`/`remove()`, pas de rebuild complet.

5. **Seuil critique non atteint.** Lighthouse flag un DOM excessif à ~1 400 nœuds. Le panneau source data d'une bibliothèque de 5 000 fichiers avec ~200 dossiers dépliés reste sous ce seuil. Le `content-visibility: auto` CSS repousse encore ce seuil.

### Alternative déjà en place

```css
.file-row {
  content-visibility: auto;
  contain-intrinsic-size: auto 28px;
}
```

→ Le navigateur ne peint pas les `.file-row` hors viewport. Coût : 0.

**Verdict :** À reconsidérer uniquement si un profilage réel (Chrome DevTools Performance tab) montre des frames > 100ms pendant le rendu du panneau source. Le `content-visibility: auto` CSS couvre le cas d'usage actuel.

---

## Synthèse finale

| # | Amélioration | Statut | Effort | Fichiers | Priorité |
|---|-------------|--------|--------|----------|----------|
| B | Async scan (ProcessPoolExecutor) | ✅ À faire | 1h | `app.py` + `test_app.py` | 🔴 Haute |
| A | Undo/redo copies | ❌ Drop | — | — | ⚪ Backlog |
| C | Virtual scrolling | ❌ Drop | — | — | ⚪ Si profilé |

**Prochaine étape :** Implémenter B (async scan) si le besoin est confirmé. Le gain principal : ne plus bloquer Flask pendant le scan, tout en réutilisant l'infrastructure de polling existante.

**Alternative immédiate si B n'est pas prioritaire :** Ajouter un endpoint `POST /delete` (~30 lignes Python) pour permettre la suppression de fichiers mal copiés — correction manuelle simple sans undo/redo complet.
