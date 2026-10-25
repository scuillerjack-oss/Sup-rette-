# Règles du projet MA P'TITE SUPÉRETTE — à lire par toute session Claude

Jack est le propriétaire et le décideur. Il pilote depuis son téléphone Android, souvent depuis un chantier :
messages courts, en français, livrables prêts à l'emploi. Claude donne son avis sincère, même pour dire non.

## Documents de référence (`docs/`)
- `CAHIER-DES-CHARGES.md` : feuille de route validée avec Jack (section « Réalisé » à la fin).
- Un cahier en préparation peut n'exister que sur une branche `mission/…` : toujours regarder les branches non fusionnées.

## Fusion dans `main`
Jack laisse à Claude le contrôle de GitHub et l'autorise à fusionner ses Pull Requests une fois les vérifications passées :
1. tests automatiques au vert (`node --test "tests/*.mjs"`) ;
2. jeu vérifié dans un Chrome mobile simulé (Playwright, 390×844) sur le parcours réel ;
3. relecture par un sous-agent indépendant sans point bloquant.

Chaque fusion publie automatiquement : le site https://scuillerjack-oss.github.io/Sup-rette-/ (`deploy.yml`)
et l'APK de bêta https://github.com/scuillerjack-oss/Sup-rette-/releases/download/beta/superette-beta.apk (`android-apk.yml`).

Depuis la V1.3 : service worker « réseau d'abord », `version.txt` publié et comparé par le jeu (`src/update.js`),
version `numéro+commit` visible en jeu. Ne jamais remettre un service worker « cache d'abord » (c'est ce qui bloquait
la bêta en V1.0). Toute sauvegarde de la partie passe par `createSaver` (`src/storage.js`).

## Interdits sans accord explicite de Jack, écrit dans la conversation
- `git push --force`, `git reset --hard` sur une branche partagée, pousser directement sur `main`.
- Supprimer une branche, un fichier de jeu ou un dépôt. Reconstruire le jeu « de zéro ».
- Renommer les clés de sauvegarde (la partie du joueur doit survivre à chaque mise à jour).
- Créer ou activer quoi que ce soit de payant (AdMob réel, produit Play, profil marchand).
  Mettre une clé, un mot de passe ou un keystore réel dans le dépôt (seule exception : la clé de DÉBOGAGE publique
  `android-debug/superette-debug.keystore`, réservée aux APK de bêta — ne jamais la régénérer).
- Travailler sur plusieurs versions en même temps.

## Obligatoire à chaque version
- Tests verts avant tout push ; un test pour chaque bug corrigé.
- Monter `version` dans `package.json` (elle donne aussi la version de l'APK) ; mettre à jour la section
  « Réalisé » de `docs/CAHIER-DES-CHARGES.md`.
- Modèle économique : jeu gratuit, financé plus tard par la pub ; aucun coût de fonctionnement (pas de serveur,
  d'API, de LLM). Une seule monnaie : les **pièces**, gagnées en jouant — **pas de diamants** ni de monnaie premium.
  Achats de confort seulement (ex. « sans pub »), jamais d'avantage payant.

## Technique
- JS vanilla, aucune dépendance npm pour le jeu : `node build.mjs` produit un `dist/index.html` autonome
  (Three.js inliné depuis `vendor/three.min.js`) et y copie `public/` (sw.js, manifest, offline.html, icons).
- Chemins toujours relatifs (le même `dist/` sert GitHub Pages et l'APK).
- Android : `android/` n'est PAS committé, la CI le régénère (`npx cap add android` + `scripts/android-prepare.mjs`).
  Les icônes Android sont dans `android-res/`. npm (Capacitor seulement) n'est utile qu'en CI.
- npm dans les sessions Claude : passer par le proxy (`npm install --https-proxy=$HTTPS_PROXY --proxy=$HTTPS_PROXY --noproxy=localhost --cafile=/root/.ccr/ca-bundle.crt`).
