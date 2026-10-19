# Ma P’tite Supérette

**Jouer** : https://scuillerjack-oss.github.io/Sup-rette-/ · **APK de bêta** : https://github.com/scuillerjack-oss/Sup-rette-/releases/download/beta/superette-beta.apk

Nom provisoire. Jeu mobile de gestion de supérette : on commande, on range, on encaisse, puis on délègue.

## Ce qui est jouable
- **Ordinateur de commande** (en haut à droite ou bouton « Commander ») : cartons livrés en ~10 s dans la réserve (24 places).
- **Mise en rayon** : toucher un carton pour le prendre, puis une étagère (les étagères compatibles clignotent).
  Une étagère = un produit, 18 articles.
- **Clients** : liste de courses, prix comparé au prix conseillé, file d’attente avec patience, humeur (😊 😕 😠 ❓ 💸).
- **Caisse manuelle** : scanner chaque article, puis carte (taper le montant), appoint, ou espèces (rendre la monnaie
  avec billets et pièces ; rendre trop = perte).
- **Personnel loué 7 journées en pièces** : caissière Léa (190, niveau 2), magasinier Momo (160, niveau 3).
- **Progression** : 25 niveaux, 18 produits (licences), 21 étagères, 2 agrandissements (niv. 5 et 10), 2e caisse (niv. 8).
- **Journées** : préparation sans chrono → ouverture 8 h-20 h (~3 min 30 en ×1) → bilan (ventes, achats, loyer).
- Vitesse ×1/×2/×3, sons et **vibrations désactivables** (menu ☰), sauvegarde automatique sur le téléphone.

## Rythme mesuré (robot joueur, `node tests/bot.mjs 170`)
Niveau 5 vers le jour 7, niveau 10 vers le jour 31, niveau 15 vers le jour 68, niveau 20 vers le jour 125
(≈ 13 h de jeu simulé). Le dernier produit arrive au niveau 20. À affiner avec les vrais retours de jeu.

## Technique
JS sans dépendance, rendu Canvas 2D haute définition (tout est dessiné par le code), un seul fichier HTML.
`node build.mjs` → `dist/index.html` ; `node --test "tests/*.mjs"` (5 tests, dont un robot qui joue 20 journées) ; `node scripts/bot.mjs 170` pour mesurer le rythme.
Moteur sans DOM (`src/game.js`), donc prêt à passer en APK Capacitor comme RUPTURE.

## Pistes V0.2
Gains hors ligne (les employés font tourner le magasin appli fermée), frigos et produits frais, prix du marché qui bougent,
décoration, objectifs quotidiens, musique (à choisir à l’oreille), dépôt GitHub + APK de bêta.
