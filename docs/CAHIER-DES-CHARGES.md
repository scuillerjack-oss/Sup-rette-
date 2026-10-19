# Ma P’tite Supérette — Cahier des charges

Commande de Jack (19/10/2026) : un jeu mobile façon « Supermarket Simulator », pensé pour le téléphone :
commande à l’ordinateur, mise en rayon, caisse tenue soi-même, personnel loué une semaine **en pièces**
(jamais de diamants), stock acheté en pièces, progression calculée pour ne finir le jeu ni en 10 minutes ni en un mois.
Retour sur la V0.1 : « le concept me plaît, les graphismes doivent monter d’un niveau » + idées de Jack :
prix et réputation, erreurs de caisse possibles, caissières à niveaux.

## Principes
- Jeu gratuit, une seule monnaie (les pièces), aucun avantage payant. Pub et « sans pub » plus tard, rien d’activé.
- Sessions courtes : une journée ≈ 3 min 30 en ×1 ; préparation sans chrono ; bilan à chaque fin de journée.
- Erreurs de caisse : elles viennent des gestes du joueur (ou du niveau du caissier), jamais d’un hasard pur.
- Durée visée : magasin au maximum en 10 à 15 h de jeu (mesurée par le robot joueur `scripts/bot.mjs`).

## Contenu V1
1. **3D low-poly** (Three.js, embarqué) : magasin vu en perspective, lumière douce et ombres, personnages animés,
   articles visibles en rayon, cartons empilés, enseigne. Repli automatique en 2D si le téléphone n’a pas de WebGL.
2. **Commande, réserve, mise en rayon** : 18 produits à licence, 24 places de réserve, étagères de 18 articles.
3. **Caisse manuelle** : scanner, puis carte (taper le montant), appoint ou espèces (rendre la monnaie).
   Valider un mauvais montant est possible : client facturé trop → ça passe, mais s’il le remarque la réputation baisse ;
   pas assez rendu → idem ; trop rendu ou trop peu encaissé → perte d’argent.
4. **Personnel à niveaux** (1 à 5 étoiles), candidats renouvelés chaque semaine, contrats de 7 journées en pièces :
   caissiers (vitesse, taux d’erreur 10 % → 0 %), magasinier (vitesse). Une personne par caisse, un magasinier.
5. **Prix et réputation** : prix minimum = prix d’achat ; chaque article vendu fait monter la réputation s’il est
   bon marché et la fait baisser s’il est cher ; indice prix du magasin affiché ; la réputation fait venir les clients.
6. **Progression** : 25 niveaux, 21 étagères, 2 agrandissements (niv. 5 et 10), 2e caisse (niv. 8).
7. **Réglages** : sons et vibrations désactivables, vitesse ×1/×2/×3, sauvegarde automatique (clé `superette-save-v1`).
8. **Production** : GitHub Pages + APK de bêta qui se met à jour seul (`releases/download/beta/superette-beta.apk`).

## Réalisé
V1.0.0 — 19/10/2026 : tout le contenu ci-dessus. Tests : 5 tests Node (dont un robot qui joue 20 journées) ;
parcours complet vérifié en Chrome mobile simulé (commande, rangement, caisse dans les 3 modes de paiement, personnel,
bilan). Rythme mesuré par le robot (V0.1, règles proches) : niveau 10 vers le jour 30, niveau 20 vers le jour 125.

## Pistes suivantes
Gains hors ligne, frigos et produits frais, prix du marché qui bougent, objectifs du jour, décoration, musique
choisie à l’oreille par Jack, fiche Google Play.
