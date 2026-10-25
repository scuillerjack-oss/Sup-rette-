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
2. **Commande, réserve, mise en rayon** : 18 produits à licence, 30 places de réserve (V1.4), étagères de 18 articles.
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

### V1.3 — bêta qui se met à jour toute seule, « Nouvelle partie » réparée, haut de l'écran dégagé (25/10/2026)
Retours de bêta de Jack (19-25/10) traités dans cette étape : les 3 points bloquants seulement. Les autres retours
(cartons lisibles, réserve libre et plus grande, magasinier, ordinateur retiré, erreurs de caisse, tutoriel…) sont
les étapes suivantes. Aucun changement de gameplay.

**1. La bêta restait en V1.0 sur le téléphone — cause racine (audit)**
- Ce qui marchait : à chaque fusion, la CI a bien republié l'APK (V1.2.0, versionCode 10200005, le 20/10) et le site
  GitHub Pages. Le tag git « beta » est bien resté sur le commit V1.0, mais il ne bloquait rien : l'adresse de l'APK
  sert toujours le dernier fichier envoyé. Il est quand même déplacé désormais à chaque publication, pour que la page
  GitHub de la bêta indique le bon commit.
- La vraie cause : le **service worker** du jeu (le petit programme qui garde le jeu en mémoire pour le hors ligne).
  En V1.0 il servait **d'abord la copie en cache** et téléchargeait la nouvelle version en arrière-plan, sous un nom
  de cache figé (« superette-1.0.0 »), et le fichier `sw.js` ne changeait jamais d'une version à l'autre. L'appli
  installée (qui charge le jeu depuis le site) réaffichait donc la V1.0 gardée en mémoire. Réinstaller l'APK par-dessus
  ne vidait pas ce cache (il appartient à la WebView du téléphone, pas à l'APK).
- Le mécanisme d'ARKEN (V12.1 + V12.2) qui marche : APK qui charge le site, service worker « réseau d'abord », cache
  nommé par version+commit, `version.txt` publié, version visible.

**Ce qui est fait**
- `public/sw.js` réécrit : **réseau d'abord**, cache en secours seulement hors ligne ; nom du cache = version+commit
  (tamponné par `build.mjs`), donc `sw.js` change à chaque publication et efface les anciens caches. Enregistré avec
  `updateViaCache: 'none'` et revérifié à chaque retour dans l'appli.
- `version.txt` publié avec le site ; le jeu le compare à sa propre version (`src/update.js`) :
  au lancement, une version plus récente → sauvegarde puis rechargement automatique (une seule tentative par version,
  jamais de boucle) ; en cours de partie (retour dans l'appli) → bandeau « Nouvelle version … Mettre à jour » qui ne
  coupe pas la partie. Silencieux hors ligne.
- **Version affichée** dans le jeu (petite étiquette en haut à droite du magasin + menu ☰), au format
  `v1.3.0+abc1234` (numéro + commit court), comme ARKEN. L'APK porte le même nom (`1.3.0+abc1234-beta`).
- APK : à la première ouverture d'un **nouvel APK**, l'ancien service worker gardé par la WebView est effacé
  (`scripts/natif/MainActivity.java`, branché par `android-prepare.mjs`) ; la sauvegarde n'est pas touchée.
  versionCode toujours croissant : 1.3.0 donne 10300000 + n° de build, au-dessus de la V1.2 publiée (10200005).
- CI : le tag « beta » suit le dernier commit publié ; `deploy.yml` vérifie `version.txt` et le tamponnage.

**2. « Nouvelle partie » ne faisait rien — cause et correction**
- Cause : le bouton effaçait la sauvegarde puis rechargeait la page ; or le rechargement déclenche l'événement
  « page cachée », qui **réécrivait aussitôt l'ancienne partie**. Au redémarrage, l'ancienne partie revenait.
- Correction (`src/storage.js`) : une partie neuve est écrite et toute sauvegarde de l'ancienne est bloquée jusqu'au
  rechargement. Bouton « Recommencer » dans le menu ☰ → fenêtre de confirmation « Nouvelle partie ? » (Annuler /
  Oui, tout effacer). Tout repart de zéro (jour, pièces, stock, réserve, étagères, personnel, popularité, niveau,
  objectifs, tutoriel) ; seuls les réglages son et vibrations sont gardés (clé à part, jamais touchée).
  Clé de sauvegarde `superette-save-v1` inchangée.

**3. Haut de l'écran sous l'heure, le wifi et la batterie**
- L'en-tête descend sous la barre d'état (`env(safe-area-inset-top)`), la barre du bas reste au-dessus de la barre de
  navigation (`safe-area-inset-bottom`), y compris panneaux, caisse et fenêtres. Sur les WebView Android plus anciennes,
  on utilise aussi les valeurs injectées par Capacitor (`--safe-area-inset-*`, plugin SystemBars configuré dans
  `capacitor.config.json`, icônes de la barre d'état en clair sur le fond sarcelle).

**Vérifications** : 39 tests Node (15 nouveaux : comparaison de versions, rechargement unique, service worker réseau
d'abord simulé en ligne/hors ligne, tamponnage du build, versionCode, workflow, nouvelle partie complète + réglages
gardés + stockage plein, confirmation, zones protégées, purge Android). Chrome mobile simulé (393×851) : nouvelle
partie (Annuler garde la partie, Oui repart au jour 1, relance = jour 1, réglages gardés), en-tête et barre du bas
avec zones protégées simulées, passage d'une publication à la suivante (bandeau puis mise à jour, partie gardée),
et passage depuis l'ancien service worker V1.0 (V1.0 encore au 1er lancement, V1.3 dès le 2e). Relecture
indépendante : aucun point bloquant ; corrigé : anti-boucle de rechargement renforcé, version.txt jamais mis en
cache, délai de 6 s avant de passer au cache sur un réseau qui accroche, Java sans dépendance androidx,
confirmation « Nouvelle partie » ouverte en priorité.

**Ce qui reste manuel pour Jack (une seule fois)**
1. Après la fusion, attendre ~5 min que la CI publie (onglet Actions vert).
2. Sur le téléphone, ouvrir https://github.com/scuillerjack-oss/Sup-rette-/releases/download/beta/superette-beta.apk
   et installer **par-dessus** l'appli actuelle (même signature : la partie est gardée).
3. Ouvrir le jeu avec internet : l'étiquette en haut à droite doit afficher `v1.3.0+…`. Si elle n'apparaît pas,
   fermer complètement l'appli (balayer dans les applis récentes) et la rouvrir.
4. Ensuite, plus rien à faire : chaque fusion arrive au lancement suivant (ou via le bandeau « Mettre à jour »).
   En dernier recours seulement : Paramètres Android → Applis → Ma P'tite Supérette → Stockage → « Vider le cache »
   (pas « Effacer les données », qui supprimerait la partie).

**Limites connues** : sans internet, l'appli affiche la dernière version gardée (normal). Un vrai Android n'a pas pu
être testé depuis la session Claude (vérification faite en Chrome mobile simulé) : le retour de Jack après
l'installation confirmera. Les nouveautés natives (purge du service worker, barre d'état) ne changent qu'avec un nouvel
APK ; le jeu lui-même, oui, à chaque fusion.

### V1.4 — rangement intelligent, réserve libre de 30 cartons, noms lisibles, erreurs de caisse (25/10/2026)
Retours de bêta de Jack du 25/10 (faits sur la V1.0), étapes 2 et 3. Rien de la V1.2/V1.3 n'est retiré.

**A. Lisibilité**
- Chaque produit a un nom court (`short` dans `src/data.js`). Il est écrit en gros sur le dessus et la face avant
  des cartons 3D, avec l'icône et une bande de la couleur du produit. Une étiquette blanche avec le nom est aussi
  posée sur chaque carton de la réserve, à sa hauteur dans la pile : on la lit même quand les cartons sont empilés
  ou juste derrière une étagère. Chaque étagère porte un panneau de couleur avec le nom du produit (« libre » si
  elle n'a pas encore de produit). Même chose en 2D.
- La première rangée d'étagères (allée 1) descend d'une ligne (3 → 4). Les cartons ne sont plus cachés derrière.
- **Magasinier qui changeait de coiffure à chaque pas.** Cause : les chemins en escalier le faisaient pivoter à
  chaque case, et on voyait alternativement son visage et l'arrière de sa tête. Correction : à longueur égale, les
  chemins prennent maintenant le moins de virages possible. En plus, l'apparence de chaque employé est fixée par sa
  fiche (`staffLook`) et n'est plus jamais tirée de l'identifiant d'affichage. Valable aussi pour les caissiers.

**B. Rangement intelligent (magasinier)**, mêmes règles à tous les niveaux :
- Un produit va dans SON rayon. Il ne va dans une étagère neuve sans produit que si ce produit n'a encore aucun
  rayon. Jamais dans le rayon d'un autre produit, même vide (seul le joueur peut réaffecter un rayon vide).
- Il ne prend un carton que s'il y a de la place dans un rayon compatible. Sinon il attend près de la réserve,
  sans aller-retour sans fin.
- Il prend l'initiative : rayon vide d'abord, puis le moins rempli. Il sort un carton coincé sous d'autres en
  soulevant ceux du dessus, ce qui prend un peu de temps. Le scénario de Jack (eau pleine, pâtes vides, pâtes sous
  l'eau) est testé aux 5 niveaux : il range les pâtes et laisse l'eau en réserve.
- Chaque carton et chaque rayon visés sont réservés : deux employés ne font jamais la même tâche. Si le joueur
  prend le carton visé, ou déplace l'étagère, il change de tâche aussitôt.
- Les étoiles ne jouent que sur la vitesse et l'initiative. ⭐ : il complète un rayon sous 40 % et réfléchit 1,6 s
  entre deux tâches. ⭐⭐⭐⭐⭐ : sous 95 % (s'il y a au moins un tiers de rayon à remplir), 0,35 s. C'est expliqué
  dans la fiche Personnel (« Comment travaille le magasinier ? ») et sur chaque candidat (« complète un rayon sous
  X % »).

**C. Réserve**
- L'ordinateur et son bureau sont supprimés (on commande avec le bouton 🛒 « Commander »). Les racks muraux
  décoratifs aussi. La réserve occupe 3 lignes sur toute la largeur.
- **Capacité : 30 cartons** (V1.3 : 24 annoncés, mais seule la ligne du fond servait vraiment), piles de 3 au plus.
  Mesure au robot (6 parties de 120 jours), en cartons vendus par jour en moyenne (pointe entre parenthèses) :
  niveaux 1-4 : 3,4 (5,7) ; 5-9 : 6,8 (12,5) ; 10-14 : 12,5 (20) ; 15 et plus : 15,8 (23).
  Avec 30 places, un grand magasin a 2 jours d'avance sans que la réserve devienne un entrepôt.
- Toute la zone de réserve est touchable. Mains vides, on prend le carton du dessus. Avec un carton, on le pose
  sur la case touchée. Sont refusés, avec un message : pile pleine, quelqu'un debout sur la case ou en train d'y
  aller, place d'attente du magasinier, et toute pose qui rendrait une pile, un rayon ou une personne
  inaccessible. La même vérification protège l'achat et le déplacement d'une étagère de l'allée 1, qui touche la
  réserve. Les livraisons vont d'office sur les palettes (lignes 1-2), avec le même produit si possible.

**D. « Introuvables » → « Demandes non satisfaites »**
- Ce que mesure le code : un client voulait un produit absent ou vide en rayon, ou en voulait plus qu'il n'en
  restait. Chaque demande ratée rend le client moins content, ce qui fait baisser la popularité. Il n'y a pas
  d'effet direct sur l'argent. Cet effet n'a pas été changé.
- Bilan : pastille « ❓ N demandes non satisfaites ? ». En la touchant, on voit l'explication, les produits les
  plus demandés et ce qu'on peut faire (remplir les rayons, commander d'avance, un rayon par licence).
  L'objectif du jour et la fiche Popularité sont renommés pareil.

**E. Erreurs de caisse (règle de Jack)**, en 3 étapes séparées dans `src/game.js` :
- `cashError` (l'erreur) → `cashDetect` (le client la remarque-t-il ?) → `cashReaction` (la popularité).
- En faveur du client (trop rendu, montant carte trop bas, article oublié par un caissier) : la popularité monte
  un peu, +0,15 par pièce offerte, au plus +0,5. Le client est content 😊. Cause dans le bilan :
  « 🎁 Erreurs de caisse en faveur du client ».
- En faveur du magasin et remarquée (80 % pour la monnaie, 70 % pour la carte ou un caissier) : −2 (toi),
  −1,5 (caissier).
- En faveur du magasin et pas remarquée : rien.
- Les réglages sont dans `CASH_ERRORS` (`src/data.js`).

**Sauvegarde** : la clé `superette-save-v1` est inchangée. Une partie V1.3 se charge : les cartons restent sur
les mêmes palettes, les étagères gardent leur emplacement (identifiants inchangés), le magasinier reçoit son
apparence fixe, et une réserve abîmée ou trop longue est nettoyée (rien n'est perdu : le surplus revient en
livraison).

**Vérifications** : 66 tests Node, dont 27 nouveaux (scénario de Jack aux 5 niveaux, aucun mélange sur une longue
journée, pas de prise sans place, pas de boucle, initiative, niveaux, étagère neuve, 2 employés, carton pris par le
joueur, réserve 30, pose et reprise libres, poses invalides, carton coincé, livraisons, noms, apparence et virages,
demandes non satisfaites, erreurs de caisse joueur et caissier, migration V1.3, magasin complet accessible).
Parcours réel en Chrome mobile simulé (390×844), en 3D et en 2D : commande par le bouton, carton pris, posé
derrière les étagères, repris et rangé, pile pleine refusée, magasinier dans le scénario de Jack, fiche Personnel,
bilan avec explication, vieille partie V1.3 chargée et rangée. Rythme au robot inchangé (niveau 10 vers le jour 31).
Relecture indépendante : aucun point bloquant. Corrigé : un carton pouvait se poser sur la case où quelqu'un
allait ; une pile entourée (sauvegarde abîmée) n'est plus choisie ; plus d'aller-retour du 5 étoiles pour 1 article.

**Limites connues / à décider avec Jack** : rendre trop de monnaie exprès fait gagner un peu de popularité. C'est
sa règle, plafonnée à +0,5 par client et payée en pièces : à surveiller en bêta (baisser `gainPerCoin` si
besoin). Le tutoriel facultatif et rejouable n'est pas dans cette étape.

### V1.5 — tutoriel facultatif, code couleur des cartons, caisse réparée (25/10/2026)
Dernier retour de Jack du 25/10 (tutoriel) et deux retours de bêta sur la V1.4 (cartons cachés par leur nom,
caisse qui encaisse 1 600 au lieu de 1,60). Rien de la V1.4 n'est retiré.

**A. Bug de caisse corrigé en premier (1 600 encaissés pour un ticket de 1,60)**
- Cause : le terminal de carte n'avait pas de virgule. On tapait des centimes (« 160 » = 1,60) ; un 0 de trop
  donnait 16,00, deux de trop 160,00… jusqu'à 9 999,99. Et une erreur en faveur du magasin coûtait au plus 2 points
  de popularité, qu'elle soit de 0,10 ou de 1 600 pièces : surfacturer rapportait une fortune.
- Saisie : on tape le montant comme on le lit, **avec la virgule** (touche « , » du pavé ; le point marche aussi et
  devient une virgule). Au plus 3 chiffres avant la virgule (999,99) et 2 après : le chiffre en trop est refusé avec
  un message. « 1,6 », « 1,60 » et « 1.6 » donnent tous 1,60.
- Seuils **proportionnels au ticket** (fixés par le chef de projet avec Jack ; réglages dans `CASH_ERRORS` et
  `cashThresholds()`, `src/data.js`). Écart = ce que le client paie en trop :
  1. jusqu'à **max(0,20 ; 5 % du ticket)** : peut passer inaperçu ; plus l'écart est grand, plus il se voit ;
  2. au-dessus, jusqu'à **min(10 ; max(2 ; 50 % du ticket))** : le client le voit toujours, il paie quand même, la
     popularité baisse de −2 (−1,5 pour un caissier) plus 0,6 par pièce au-delà du seuil 1 ;
  3. au-delà : il **refuse** : vente annulée, pas une pièce encaissée, articles reposés en rayon, client furieux
     (compté « parti fâché »), −8 de popularité plus 0,4 par pièce au-delà du seuil (25 au plus).
  Exemples : ticket 1,60 → inaperçu jusqu'à +0,20, paie jusqu'à +2,00, refuse au-delà.
  Ticket 30 → inaperçu jusqu'à +1,50, paie jusqu'à +10,00, refuse au-delà.
- **Bouche-à-oreille** (pour que ce ne soit pas un glitch) : chaque pièce prise en trop et remarquée, au-delà du
  seuil 1, rend le quartier méfiant. Clients des jours suivants × (1 − méfiance / 25), méfiance divisée par 2
  chaque nuit. Seulement quand c'est toi qui encaisses : l'erreur d'un caissier n'en crée pas.
- Rendu de monnaie : même règle (garder trop de monnaie = surfacturer). Trop rendu : le gain de popularité reste
  plafonné à +0,5 par client, et ça coûte les pièces rendues.
- Caissiers : un article compté deux fois suit la même règle, y compris le refus.
- **Simulation** (test permanent dans `tests/v15.test.mjs`) : le robot joue 6 parties de 8 jours sans rien acheter
  d'autre que la marchandise, honnête ou en surfacturant chaque client. Pièces à la fin, en moyenne :
  honnête 213 ; +1 pièce 91 ; +3 pièces −35 ; +5 pièces −50 ; +10 pièces −57. Le joueur honnête finit plus riche
  dans les 6 parties, quel que soit l'écart.

**B. Code couleur des cartons (retour de Jack : les noms cachaient les cartons)**
- Plus aucun nom écrit sur les cartons. Chaque produit a une **couleur d'étiquette** (`tag` dans `src/data.js`) :
  Eau bleue, Pâtes orange, Chips rouge, Soda violette, Biscuits marron, Lait blanche, Café noire, Céréales jaune,
  Savon turquoise, Chocolat rose, Riz grise, Jus vert clair, Shampoing bleu marine, Fromage beige,
  Confiture bordeaux, Thé vert foncé, Dentifrice bleu ciel, Bonbons lilas.
- En 3D : une bande de couleur en travers du dessus du carton (comme un adhésif) et une étiquette de couleur sur la
  face avant, avec la petite icône du produit (aide pour les daltoniens). Une petite pastille de couleur dans le
  coin de chaque carton de la réserve reste visible même empilé ou juste derrière une étagère.
  En 2D : bande de couleur en haut du carton, ou en bas de sa partie visible quand un autre carton est posé dessus.
- Le nom reste **uniquement sur les étagères** : le panneau et le haut de l'étagère prennent la même couleur que
  l'étiquette des cartons. Couleurs testées pour rester bien différentes entre elles.
- Captures avant/après (3D et 2D) prises dans le Chrome mobile simulé.

**C. Tutoriel facultatif et rejouable**
- **Proposé au tout premier lancement** (fenêtre « Bienvenue ! » : Passer / Jouer le tutoriel), jamais imposé.
  Un joueur qui a déjà une partie n'a pas de fenêtre : un petit message lui signale le tutoriel dans le menu ☰.
- **Rejouable à tout moment** : menu ☰ → « 📘 Tutoriel » → Jouer (ou Reprendre / Recommencer s'il a été quitté en
  route). Il se joue dans une **partie d'essai séparée**, avec sa propre clé de sauvegarde
  (`superette-tuto-save-v1`). La partie normale (`superette-save-v1`) est sauvegardée une dernière fois au lancement
  du tutoriel, puis plus jamais lue ni écrite jusqu'au retour ; testé avant, pendant et après.
- **Quitter à tout moment** : bouton « Quitter » de la bulle, ou menu ☰ → confirmation → retour à sa partie telle
  qu'elle était. Le tutoriel est gardé pour « Reprendre ». À la fin, la partie d'essai est effacée.
- « Nouvelle partie » (V1.3) inchangé ; il n'apparaît pas dans le menu pendant le tutoriel (il effacerait la partie
  d'essai, pas la vraie, ce qui prêterait à confusion).
- **18 étapes sur 2 journées**, chacune avec un objectif concret ; ce qu'il faut toucher est entouré d'un anneau
  orange qui pulse (boutons, articles, cases du magasin) ; la bulle se place en haut ou en bas pour ne jamais
  cacher la cible, peut être repliée (—), et s'efface quand une fenêtre sans rapport s'ouvre (niveau gagné) :
  1. Bienvenue (partie d'essai, 400 pièces pour l'essai) · 2. Commander 1 carton d'Eau et 1 de Pâtes (🛒) ·
  3. Le code couleur des cartons et la réserve (30 cartons) · 4. Ranger la réserve : prendre un carton et le
  reposer sur une case libre (3 par pile, garder un passage) · 5. Mettre en rayon : chaque carton dans l'étagère de
  sa couleur, lire le nom (18 articles par rayon) · 6. Fixer un prix (prix plancher = prix d'achat, effet sur la
  popularité et les ventes) · 7. Ouvrir le magasin · 8. Aller à la caisse · 9. Scanner · 10. Rendre la monnaie (trop
  rendu / pas assez) · 11. Paiement par carte avec la virgule, et les trois zones d'erreur de caisse ·
  12. Finir la journée (vitesse ×2, ×3) · 13. Le bilan : ventes, achats, loyer et charges, résultat, demandes non
  satisfaites (un client du scénario veut des Chips absentes) · 14. Embaucher (caissier niveau 2, magasinier
  niveau 3, étoiles, contrat de 7 journées) · 15. Acheter une étagère · 16. Déplacer une étagère (gratuit, le
  produit suit) · 17. Niveaux et déblocages (liste réelle tirée du code) · 18. Journée 2 en autonomie, puis
  « Tutoriel terminé » → retour à sa partie.
- **Scénario fixe** pour que chaque étape soit faisable : rayons Eau et Pâtes déjà attribués, niveau 2 presque fini
  (le niveau 3 arrive pendant la journée 1 et débloque le magasinier), les 3 premiers clients ont une liste connue
  (le 3e veut des Chips), le 1er paie en espèces et le 2e par carte. Les **règles** sont celles du vrai jeu : le
  tutoriel n'ajoute que ces listes et ces modes de paiement imposés, et seulement dans la partie d'essai.
- Fichiers : `src/tutorial.js` (étapes, scénario, sauvegardes, sans DOM, testé sous Node) et `src/tutoui.js`
  (bulle et anneaux). Les anciennes petites bulles d'aide de la V1.0 restent dans la partie normale ; elles sont
  coupées dans le tutoriel.

**Sauvegarde** : clé `superette-save-v1` inchangée. Une partie V1.4 se charge sans rien perdre (pas de méfiance,
pas de tutoriel en cours). Nouvelles clés à part : `superette-tuto-save-v1` (partie d'essai) et `superette-tuto-v1`
(tutoriel déjà proposé ? partie en cours = normale ou essai ?).

**Vérifications** : VERIF_PLACEHOLDER

**Limites connues** : LIMITES_PLACEHOLDER

## Prochaine version (V1.6)
1. **Concurrents dans le quartier** : 1 puis 2 magasins rivaux qui apparaissent avec la progression ; ils prennent des
   clients quand ta popularité est plus basse que la leur (facteur dans `dayMultiplier()`), font parfois des promos,
   et apparaissent dans le bilan (« Le Discount d'en face t'a pris 6 clients »).
2. Retours de bêta de Jack sur les graphismes V1.2, les objectifs et les événements (on garde, on ajuste ou on enlève).
3. Proposé : un écran « Mon quartier » simple (popularité comparée aux concurrents, événement du jour).
4. Proposé : réglage « graphismes économes » manuel dans le menu, pour les téléphones très modestes.

## Pistes suivantes
Gains hors ligne, frigos et produits frais, prix du marché qui bougent, décoration, musique
choisie à l’oreille par Jack, fiche Google Play.
