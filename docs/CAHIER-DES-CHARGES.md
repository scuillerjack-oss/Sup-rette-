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

V1.2.0 — 20/10/2026 (demandes de Jack du 20/10) :
- **Déplacer une étagère déjà placée**, gratuitement : bouton « Déplacer cette étagère » dans la fiche d'un rayon,
  ou « Déplacer » dans Aménager (on touche l'étagère, puis un « + » libre). Le produit et la quantité suivent.
  Bandeau orange avec « Annuler », grosses cibles (toucher tolérant élargi), halos au sol : étagère choisie en orange,
  « + » libres en vert. Refusé avec un message clair si tu remplis ce rayon, si le magasinier le remplit, si un client
  s'y sert, ou si quelqu'un passe sur l'emplacement visé. Les chemins de tout le monde sont recalculés
  (clients et magasinier qui allaient vers l'ancien emplacement vont au nouveau).
- **Graphismes 3D refaits** (toujours low-poly, sans fichier externe) : lumière chaude et ombres douces, sol carrelé
  crème avec reflets des plafonniers, murs avec soubassement, plinthes et vitres, enseigne à ampoules, store banne rayé,
  gondoles bois et métal, articles reconnaissables par forme (bouteilles, canettes, sachets, briques de lait,
  bocaux, meules…) qui remplissent les rayons par le haut, réserve avec palettes et racks, bureau avec lampe et plante,
  caisses en bois avec tapis, terminal, présentoir à bonbons et sacs, affiche promo, horloge, plantes, paniers.
  Personnages refaits (grosse tête, bras et jambes articulés, yeux, joues, lunettes pour certains) et animés :
  marche, bras qui se tendent pour se servir, gestes de mise en rayon, caissière qui scanne, petit saut des clients
  contents, client qui repart avec son sac. Étiquette de prix jaune quand le prix est bas.
  **Performances** : décor fusionné par matériau et articles instanciés : ~90 appels de rendu en préparation et ~150 dans
  un magasin plein (V1.1 : 330 à 430 sur la même scène). Qualité adaptative conservée. Repli 2D conservé (sol plus chaud,
  mode « Déplacer » visible aussi en 2D).
- **Idée ajoutée : objectifs du jour** (à partir du jour 3) : 3 objectifs tirés au hasard parmi 6 (servir N clients,
  vendre N articles, rendre la monnaie juste N fois, aucun client fâché, au plus 2 articles introuvables, gagner de la
  popularité). Petite prime en pièces par objectif réussi (1 + 0,4 × niveau), versée au bilan. Pastille « 🎯 1/3 » en haut
  à gauche du magasin, fiche détaillée, récapitulatif dans le bilan.
- **Idée ajoutée : événements de quartier** (un jour sur deux environ, à partir du jour 3), annoncés le matin :
  jour de marché (+30 % de clients), jour de pluie (−25 % de clients mais plus gros paniers), soir de match (chips et
  soda très demandés), canicule (eau et jus), jour de paie (clients moins regardants sur les prix). Effet moyen neutre.
- Sauvegarde : clé `superette-save-v1` inchangée ; une partie V1.1 se charge (objectifs créés à la volée, données
  abîmées ignorées). Relecture indépendante : aucun point bloquant ; corrigé dans la foulée : repli 2D propre si la 3D
  plante au démarrage, rechargement si Android coupe le contexte 3D, objectif « monnaie juste » jamais tiré quand
  toutes les caisses ont un caissier, refus si quelqu'un est à cheval sur l'emplacement visé. Tests : 24 tests Node (déplacement, refus, chemins toujours atteignables pendant une journée avec
  déplacements, mode au doigt, événements, objectifs, migration, rythme du robot). Parcours réel vérifié au doigt en
  Chrome mobile simulé (390×844), en 3D et en 2D.
- Rythme mesuré au robot (moyenne de 24 parties) : niveau 5 vers le jour 8, niveau 10 vers le jour 29-30
  (V1.1 mesurée de la même façon : 30-31). Le léger gain vient des primes d'objectifs ; si c'est trop rapide en bêta,
  baisser `goalReward` dans `src/data.js`.
- Concurrents (V1.3) : le branchement est prêt. Le nombre de clients passe par `customersPerDay(état, choix, mult)` et
  `Game.dayMultiplier()` ; un concurrent n'aura qu'à multiplier ce facteur selon la popularité (déjà de 0 à 100,
  effet ×0,55 à ×1,45) et à ajouter sa cause dans le détail de popularité.

## Prochaine version (V1.3)
1. **Concurrents dans le quartier** : 1 puis 2 magasins rivaux qui apparaissent avec la progression ; ils prennent des
   clients quand ta popularité est plus basse que la leur (facteur dans `dayMultiplier()`), font parfois des promos,
   et apparaissent dans le bilan (« Le Discount d'en face t'a pris 6 clients »).
2. Retours de bêta de Jack sur les graphismes V1.2, les objectifs et les événements (on garde, on ajuste ou on enlève).
3. Proposé : un écran « Mon quartier » simple (popularité comparée aux concurrents, événement du jour).
4. Proposé : réglage « graphismes économes » manuel dans le menu, pour les téléphones très modestes.

## Pistes suivantes
Gains hors ligne, frigos et produits frais, prix du marché qui bougent, décoration, musique
choisie à l’oreille par Jack, fiche Google Play.
