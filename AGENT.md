# Règles impératives pour tout agent travaillant sur ce projet

## 🚨 NE JAMAIS SUPPRIMER LES DONNÉES UTILISATEUR

Les fichiers dans `data/` contiennent des données utilisateur précieuses :

- `data/config.json` — configuration des profils (chemins source_data, epars_dirs)
- `data/journal.json` — historique complet des opérations de copie
- `data/cache.json` — résultat du dernier scan
- `data/playlists.json` — playlists créées par l'utilisateur

**Ces fichiers NE DOIVENT JAMAIS être supprimés, écrasés, ou modifiés** sans autorisation explicite et éclairée de l'utilisateur.

Même pour les tests, même pour un "smoke test", même temporairement.

## 🔒 Règles de sécurité des données

1. **Ne jamais exécuter `rm`, `rm -f`, `rm -rf`** sur un chemin contenant des données utilisateur
2. **Ne jamais écraser un fichier de données** avec `cat >`, `write_file` ou tout autre outil sans confirmation
3. **Ne jamais modifier `data/config.json`, `data/journal.json`, `data/cache.json` ou `data/playlists.json` sans demande explicite de l'utilisateur** — si des tests nécessitent une configuration alternative, utiliser un fichier temporaire ailleurs
4. **Ne jamais supprimer le cache** — il régénère automatiquement au prochain scan
5. **Demander avant toute opération destructive** — "Puis-je supprimer/écraser/modifier X ?" avec une explication claire de l'impact

## ✅ Actions autorisées sans demande

- Lire les fichiers de données (lecture seule)
- Créer des fichiers de test temporaires dans `/tmp/`
- Modifier le code source (`static/`, `app.py`, `templates/`, `test_*.py`)
- Ajouter des tests

## 🛑 Actions nécessitant une confirmation explicite

- Supprimer ou écraser un fichier dans `data/`
- Modifier une configuration existante
- Supprimer des fichiers audio source
- Toute commande contenant `rm`, `rmdir`, `delete`, `remove`
- Toute modification de `.gitignore` qui affecterait les données
