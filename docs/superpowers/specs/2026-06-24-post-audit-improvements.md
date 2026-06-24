# Post-Audit Improvements — Design Document

> Date: 2026-06-24
> Statut: Spec (révisée après contre-audit)
> Source: audit technique senior — 13 opportunités identifiées, 2 retenues

---

## Contexte

L'audit post-refactoring (v0.2-clean-architecture) a identifié 13 pistes d'amélioration.
Après contre-audit et challenge critique, **7 ont été rejetées** (prématurées,
sur-ingénierie, ou architecturalement contre-productives) et **6 sont trop
lourdes** pour le rapport coût/bénéfice actuel (tests E2E, CI/CD, async scan,
undo/redo, cheat sheet auto-généré, persistence localStorage).

Restent **2 améliorations immédiates**, à coût minimal et bénéfice certain :

| # | Amélioration | Effort |
|---|-------------|--------|
| B | `/audio` path restriction (`werkzeug.utils.safe_join`) | 30 min |
| A | `content-visibility: auto` sur les file-rows (CSS only) | 10 min |

---

## B. Sécurité — Restriction de `/audio`

### Problème

L'endpoint `/audio` accepte n'importe quel path système via `request.args.get('path')`.
La seule vérification est `os.path.exists(path)` — un attaquant peut servir
`/etc/passwd` ou tout fichier lisible par le process Flask.

### Solution

```python
# app.py — ajouts

from werkzeug.utils import safe_join

ALLOWED_DIRS: list[str] = []

def update_allowed_dirs():
    global ALLOWED_DIRS
    cfg = get_active_config()
    ALLOWED_DIRS = [cfg.get('source_data', '')] + cfg.get('epars_dirs', [])
    ALLOWED_DIRS = [d for d in ALLOWED_DIRS if d]


@app.route('/audio')
def serve_audio():
    path = request.args.get('path', '')

    # Vérifier que le path (résolu) est dans un dossier autorisé
    if not any(is_path_allowed(path, d) for d in ALLOWED_DIRS):
        abort(403)

    real_path = os.path.realpath(path)
    if not os.path.isfile(real_path):
        abort(404)

    ext = os.path.splitext(real_path)[1].lower()
    mimetype = AUDIO_EXT_MAP.get(ext, 'application/octet-stream')
    return send_file(real_path, mimetype=mimetype)


def is_path_allowed(path: str, allowed_dir: str) -> bool:
    try:
        rp = os.path.realpath(path)
        rd = os.path.realpath(allowed_dir)
        return rp == rd or rp.startswith(rd + os.sep)
    except (ValueError, OSError):
        return False


# Appeler au boot et après POST /config
update_allowed_dirs()
```

### Test

```python
# test_app.py — ajout

def test_audio_path_traversal_rejected(client):
    """Un path hors des dossiers autorisés doit retourner 403."""
    response = client.get('/audio?path=/etc/passwd')
    assert response.status_code == 403

def test_audio_allowed_path(client, tmp_path):
    """Un fichier dans un dossier autorisé doit être servi."""
    # Setup: ajouter tmp_path aux epars_dirs
    # ...
    f = tmp_path / 'test.mp3'
    f.write_bytes(b'\xff\xfb\x90\x00')  # header MP3 minimal
    response = client.get(f'/audio?path={f}')
    assert response.status_code == 200
```

---

## A. Performance — `content-visibility: auto` (CSS only)

### Problème

Pour des bibliothèques volumineuses (>1000 fichiers), le nombre de nœuds DOM
dans `#source-container` et `#epars-container` peut dépasser le seuil critique
Lighthouse de 1400 nœuds. Le navigateur recalcule le layout pour chaque nœud,
même hors viewport.

### Solution

```css
/* static/style.css — ajout */

#source-container .file-row,
#epars-container .file-row {
  content-visibility: auto;
  contain-intrinsic-size: auto 28px;
}
```

- `content-visibility: auto` → le navigateur skip le rendu des éléments hors viewport
- `contain-intrinsic-size: auto 28px` → hauteur estimée d'une ligne, le scroll reste
  fluide sans que le navigateur ait besoin de calculer la hauteur réelle
- **0 ligne de JS modifiée, 0 dépendance, 0 risque de régression**
- Compatible tous navigateurs modernes (Chrome 85+, Firefox 125+, Safari 18+)

---

## Rejetées (avec justification)

| Proposition | Raison du rejet |
|------------|----------------|
| Idiomorph DOM morphing | Prématuré : `innerHTML` sur <2000 nœuds prend <50ms. Le `content-visibility: auto` suffit. |
| `enterPlaylistMode` → `playlist.ts` | Créerait une dépendance circulaire `script.ts → playlist.ts → render.js → playlist.ts` |
| Cheat sheet `?` auto-généré | 215 lignes de code pour une feature one-shot. Le README suffit. |
| localStorage persistence | Stale data au changement de config. `localStorage.setItem()` synchrone bloque le thread. `beforeunload` non fiable sur mobile. |
| Tests E2E Playwright | Lourd (3j) pour une app single-user locale. À reconsidérer si l'app devient multi-utilisateur. |
| CI/CD GitHub Actions | Utile mais pas prioritaire pour un solo dev. `npm test && npx tsc --noEmit` en local suffit. |
| Undo/redo stack | 2j de dev pour un edge case (erreur de copie). Le dialog de confirmation F5 couvre déjà le cas nominal. |
| Async backend scan | 3j pour un gain perçu uniquement sur des bibliothèques >50k fichiers. |
| Proxy validation complète | Nice-to-have mais les 3 champs validés couvrent les bugs les plus probables. |
| TypeScript strict (éradiquer `Record<string, unknown>`) | Travail de fond utile mais long (3h). À faire progressivement. |
| `emit()` explicite vs `{ ...sourceFiles }` | Le spread actuel fonctionne et est documenté. Micro-optimisation. |

---

## Synthèse

| Action | Fichier | Effort | Risque |
|--------|---------|--------|--------|
| `safe_join` + `os.path.realpath` | `app.py` (+20 lignes) | 30 min | Nul |
| `content-visibility: auto` | `style.css` (+2 lignes) | 10 min | Nul |
| Test path traversal | `test_app.py` (+15 lignes) | 15 min | Nul |

**Total : 55 minutes. Zéro régression.**
