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

V1.1.0 — 20/10/2026 (retours de bêta de Jack) :
- **Bug urgent n°1 corrigé** : toucher l'ordinateur ou un « + » d'étagère ouvrait le panneau puis le refermait
  aussitôt (le « click » qui suit le toucher tombait sur le fond sombre du panneau). Le fond ne ferme plus que si
  le doigt s'est posé dessus, et jamais juste après l'ouverture.
- Toucher tolérant : si le doigt tombe à côté, on vise l'objet utile le plus proche (ordinateur, « + », carton, caisse) ;
  un geste annulé par le téléphone compte s'il était court et immobile.
- Bouton « Placer » dans Aménager (installe l'étagère sur le premier emplacement libre) ; le tuto indique aussi le
  bouton « Commander » du bas.
- **Popularité du magasin** : jauge 0-100 dans le bandeau (touchable pour le détail), elle bouge chaque jour :
  prix, service, arnaques repérées, choix et remplissage des rayons, étoiles du personnel. Effet fort sur les clients
  (×0,55 au plus bas, ×1,45 au sommet). Détail par cause dans le bilan de fin de journée.
- Rythme vérifié au robot : niveau 5 vers le jour 8, niveau 10 vers le jour 31 (avant : 7 et 29).

## Prochaine version (V1.2, demandée par Jack)
1. Graphismes : monter nettement le niveau (priorité n°2 de Jack après le bug du « + »).
2. Concurrents dans le quartier, à terme : des magasins rivaux qui prennent des clients si ta popularité baisse.

## Pistes suivantes
Gains hors ligne, frigos et produits frais, prix du marché qui bougent, objectifs du jour, décoration, musique
choisie à l’oreille par Jack, fiche Google Play.
