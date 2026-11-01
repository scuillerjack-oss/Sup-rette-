# Modèle économique et fiche de rentabilité — Ma P'tite Supérette

> Mise à jour du 01/11/2026 : commission Google corrigée (15 %) et étude du classement en ligne (section 9).
> Étude du 26/10/2026, demandée par Jack, mise à jour après brainstorming le même jour (version 2).
> Rien n'est codé ni activé : AdMob réel et produits Google Play seront branchés plus tard, une fois la
> micro-entreprise créée et avec l'accord écrit de Jack (règle de `CLAUDE.md`).
> Règle d'or du studio : **aucun jeu à perte**. Chaque version publiée doit mettre à jour cette fiche.

## 0. Règles décidées avec Jack (valables pour tous les jeux du studio)
- **Jamais de pub quand le joueur dit non.** Refuser une pub récompensée ne déclenche jamais d'autre pub.
- Jamais de pub pendant qu'on joue ; jamais dans le tutoriel.
- Le joueur ne peut jamais acheter la monnaie du jeu (pièces) ; pas de diamants.
- Les chances des coffres sont toujours affichées.

## 1. Les chiffres de départ (sources en fin de document)

| Donnée | Valeur retenue | Commentaire |
|---|---|---|
| Durée d'une journée de jeu | ~5 min réelles en ×1 (3 min 30 + préparation + bilan) | `GAME_MIN_PER_SEC` dans `src/data.js` |
| Durée totale du jeu | 10 à 15 h (magasin au maximum) | mesuré au robot |
| eCPM pub récompensée, France | 8 à 10 $ | la France est classée « Tier 2 » |
| eCPM interstitielle, France | 5 à 7 $ | idem |
| Valeurs prudentes utilisées | 6 € (récompensée), 4 € (interstitielle) | public francophone mélangé + taux de remplissage ~90 % |
| Rétention d'un jeu de simulation | J1 30 % · J7 8,7 % · J30 3 % | référence du marché |
| Joueurs qui achètent quelque chose | ~1 % | repère hybrid-casual |
| Commission Google Play | 10 % de commission de service + 5 % de frais de facturation = **15 %** | corrigé le 01/11/2026 : depuis le 30/06/2026, petit développeur (< 1 M$ de revenus/an), nouvelles installations. Les **25 %** ne concernent que la part au-delà de 1 M$/an. Source : blog ecorpit.com (à reconfirmer dans la Play Console). Ne touche que les achats : les pubs AdMob ne paient pas Google Play. |
| Cotisations micro-entreprise | **21,2 %** du chiffre d'affaires | revenus pub = BIC prestations « le plus souvent » ; à confirmer à l'inscription |
| Coût de fonctionnement du jeu | **0 €** | pas de serveur, pas d'API, pas d'IA payante |

## 2. Le modèle retenu

### 2.1 Pubs récompensées (facultatives) — le moteur principal
Le joueur **choisit** de regarder une pub. Pas de limite de pubs par heure ; la seule règle est **une fois par
journée de jeu pour chaque récompense** (une journée ≈ 5 min), pour empêcher de « relancer » un coffre en boucle
jusqu'au 5 étoiles, ce qui viderait la progression de son intérêt.

| Récompense | Contenu | Fréquence |
|---|---|---|
| **Coffre caissier** | un caissier intérimaire de 1 à 5 étoiles pour la journée | 1 par journée de jeu |
| **Coffre magasinier** | un magasinier intérimaire de 1 à 5 étoiles pour la journée | 1 par journée de jeu |
| **Bilan doublé** | ×2 sur le **bénéfice** de la journée (rien si la journée est en perte) | 1 par journée de jeu |
| **Coffre déco** | une décoration sans effet sur le jeu : affiche, tapis/couleur du sol, pot de fleurs, enseigne… | 1 par journée de jeu |

**Chances des coffres d'employés (affichées dans le coffre)** : 1★ 35 % · 2★ 28 % · 3★ 20 % · 4★ 12 % · 5★ 5 %.
Un 4 ou 5 étoiles tombe environ une fois sur six.
**Garantie anti-malchance** : après 5 coffres d'employé sans 4★ ou plus, le suivant donne forcément un 4★ ou 5★.
**Intérimaire du jour** : il travaille jusqu'à 20 h puis part. Si un poste est libre, il le prend ; sinon il
remplace pour la journée le moins bon employé de ce poste, qui n'est pas licencié et revient le lendemain.
Les coffres apparaissent à partir du jour 3 (après le tutoriel et les premières journées).

Écarté après brainstorming : livraison express (l'attente est déjà courte), « plus de clients »,
« sauver une mauvaise journée » (le joueur peut rejouer le tutoriel et recommencer une partie).

### 2.2 Pub imposée (interstitielle) — gardée
Un joueur qui ne regarde jamais de pub récompensée ne rapporterait rien sans elle.
- **Une pub toutes les 3 journées de jeu, uniquement au bilan de fin de journée**, jamais pendant qu'on joue.
- En ×1, ça fait **une pub toutes les ~15 min** ; en ×3, toutes les ~8 min.
- Jamais avant le jour 3, jamais dans le tutoriel, jamais deux pubs (de quelque type) à moins de 4 minutes réelles.
- Une pub récompensée regardée volontairement dans ces 3 journées **repousse** la prochaine pub imposée.

### 2.3 Achats intégrés
| Produit | Prix | Contenu |
|---|---|---|
| **Vitesse ×3** | 0,89 € | débloque le ×3 pour toujours (×1 et ×2 restent gratuits) |
| **Pack Gérant** | 2,99 € | plus aucune pub imposée + ×3 + **3 coffres offerts sans pub par jour réel** (au choix : caissier, magasinier, déco) |

Les pubs récompensées restent disponibles avec le Pack Gérant. Le caissier 5 étoiles offert prévu dans la
version 1 de cette étude est remplacé par les coffres offerts : avec les coffres, il perdait son intérêt et
c'était une exception à la règle « achats de confort seulement ».

## 3. Ce que rapporte un joueur

Pour un joueur actif **un jour donné** (environ 25 min de jeu, soit 5 journées) :
- 1,5 pub imposée × 4 € / 1 000 = 0,006 €
- 2,5 pubs récompensées × 6 € / 1 000 = 0,015 € (estimation prudente : jusqu'à 4 récompenses possibles par journée)
- Achats : 1 % des joueurs × 2,50 € de panier moyen brut, moins 15 % de commission Google (2,125 € net), étalés sur ~4,4 jours ≈ 0,005 € (avec l'ancienne commission de 25 % : 0,004 €)
- **Total ≈ 0,026 € par joueur actif et par jour** (0,025 € avec l'ancienne commission : la correction ne pèse que sur la part « achats », soit ~+2 % sur le total) (repère du marché : 0,01 à 0,05 $ pour un jeu casual à pubs)

Un joueur qui installe le jeu joue en moyenne ~4,4 jours au total (avec la rétention ci-dessus).
**Valeur d'une installation ≈ 0,11 €** avant cotisations (0,114 € avec la commission de 15 %, 0,111 € avec 25 %), ≈ **0,09 € net**.
Les tableaux de la section 4 ne bougent donc pas à l'arrondi.

## 4. Fiche de rentabilité — 3 scénarios

Valeur d'une installation : pessimiste 0,05 € · moyen 0,11 € · optimiste 0,25 €.
Cotisations : 21,2 %. Objectifs exprimés en **revenu net par mois**.

| Objectif | Net visé / mois | Chiffre d'affaires nécessaire | Joueurs actifs par jour (moyen) | Installations par mois (pessimiste / moyen / optimiste) |
|---|---|---|---|---|
| 1. Payer les abonnements IA (~45 €) | 45 € | 57 € | ~75 | 1 150 / 520 / 230 |
| 2. Mi-temps sur le chantier (~900 € net) | 900 € | 1 140 € | ~1 460 | 22 800 / 10 400 / 4 600 |
| 3. Quitter le chantier (~1 800 € net) | 1 800 € | 2 285 € | ~2 930 | 45 700 / 20 800 / 9 100 |

**Risque de perte : 0 €.** Avec 0 € de frais propres au jeu, le pire cas est « ça ne rapporte presque rien », jamais « ça coûte ».

## 5. Conclusions franches
1. **Objectif 1 (payer les abonnements) : réaliste** avec un seul jeu, s'il trouve quelques centaines de joueurs par mois.
2. **Objectifs 2 et 3 : pas réalistes avec un seul jeu** de ce type sans publicité payante. La voie réaliste est
   **le studio** : plusieurs jeux qui rapportent chacun un peu (5 jeux à ~2 100 installations/mois ≈ objectif 2
   dans le scénario moyen), et le meilleur que l'on pousse davantage.
3. Le levier le plus fort reste **la rétention** (que les joueurs reviennent) : passer de 3 % à 6 % de joueurs
   encore là au bout d'un mois double presque les revenus. Les coffres (envie de revenir ouvrir le suivant),
   les objectifs du jour et les décorations servent aussi à ça.
4. Plafond de la micro-entreprise : 83 600 € de chiffre d'affaires par an, largement au-dessus de ces scénarios.

## 6. Mesuré dans le jeu (V1.6, pubs simulées)
Coffres, intérimaire, bilan doublé, décorations et pub imposée sont codés en V1.6 avec des **pubs simulées**
(`src/ads.js`, aucune vraie pub). Mesure au robot (`scripts/bot.mjs`, 45 journées, 16 parties, coffres tirés avec graine) :

| Joueur | Niveau 10 atteint | Pièces en caisse au jour 30 |
|---|---|---|
| N'ouvre aucun coffre | jour 30,3 (repère V1.1 : 31) | ~360 |
| Ouvre **tous** les coffres et double **chaque** bilan en bénéfice | jour 28,9 (≈ 5 % plus rapide ; 27,5 à 29 selon les séries) | ~690 |

- Chances des coffres d'employés vérifiées sur 200 000 tirages (35/28/20/12/5 %) ; avec la garantie, un 4★+ tombe
  ≈ 25 % du temps au lieu de 17 %. Jamais plus de 5 coffres d'affilée sans 4★+.
- Le bilan doublé est le plus gros gain (≈ +89 pièces par journée doublée pour ce robot) ; il ne touche que les
  journées en bénéfice. Agrandissements et licences coûtent pareil : progression un peu plus rapide, pas de jeu cassé.
- Aucun chiffre du modèle (sections 2 à 4) ne change. Si la bêta trouve le bilan doublé trop généreux, piste :
  le plafonner (par exemple « jusqu'à +X pièces selon le niveau »).

## 7. À faire plus tard (pas maintenant)
- Brancher AdMob (mode test d'abord), la fenêtre de consentement RGPD, et Google Play Billing pour les 2 achats.
- Mesurer la vraie rétention et le vrai revenu pendant les 14 jours de test fermé, puis **remplacer les chiffres
  de ce document par les vrais**.
- Fiscalité : à l'inscription, vérifier BIC ou BNC et la déclaration européenne de services pour AdMob
  (prestation à une société irlandaise). Ne remplace pas l'avis d'un expert-comptable.

## Sources
- eCPM 2026 par format et par pays : revenuelab.fyi — AdMob eCPM Benchmarks 2026
- ARPDAU casual / hybrid-casual : blog.playio.co — ARPDAU benchmarks
- Rétention par genre : segwise.ai (d'après Mistplay)
- Commissions Google Play : support.google.com/googleplay/android-developer/answer/112622
- Commission 15 % depuis le 30/06/2026 (10 % + 5 %) : ecorpit.com/google-play-service-fee-split-2026-app-economics/ (blog, **à reconfirmer dans la Play Console**)
- Cotisations micro-entreprise 2026 : lecoindesentrepreneurs.fr
- Fiscalité d'une app mobile : hayot-expertise.fr

## 9. Étude du 01/11/2026 : classement en ligne

> Demande de Jack (31/10/2026) : un classement en ligne, **seulement s'il ne casse pas le modèle**. Étude seulement :
> rien n'est codé. Chiffres calculés par `scripts/economie.mjs` (`node scripts/economie.mjs`). Les coûts de
> Firebase et les détails de Google Play Jeux sont de mémoire : **à reconfirmer sur les pages officielles** avant toute décision.

### 9.1 La règle qui pèse sur tout
`CLAUDE.md` : solo hors ligne = petits avantages payants permis ; **en ligne (joueurs contre joueurs) = aucun avantage payant**.
Un classement compare des joueurs : tout ce qui améliore le score contre de l'argent y devient interdit.

| Élément du jeu | Dans la partie classée |
|---|---|
| Pack Gérant : « 3 coffres offerts par jour » (employés 5★ possibles) | **INTERDIT** (avantage payant) |
| Pack Gérant : plus de pub imposée | permis (confort, pas de score) |
| Vitesse ×3 (0,89 € ou Pack) | permis **si** le score se mesure en journées de jeu et si une seule tentative compte par semaine ; sinon interdit |
| Coffres caissier / magasinier par pub (5★ possible) | gratuits, mais **désactivés** : même départ pour tous |
| Bilan doublé par pub | **désactivé** (le plus gros gain, +89 pièces/journée au robot) |
| Coffre déco (aucun effet sur le jeu) | permis (sert de pub récompensée restante) |

### 9.2 Les options comparées
**A. Google Play Jeux (classement officiel).** Gratuit, Google héberge, gère le compte et les classements
hebdomadaire / de toujours. Coût 0 €. Travail **élevé** : plugin natif Capacitor, CI Android à adapter, configuration Play Console ;
APK de bêta et AAB seulement (pas la version web). Triche : le score vient du téléphone, Google ne le vérifie pas
(un téléphone trafiqué envoie n'importe quoi). RGPD : connexion Google obligatoire pour y figurer, c'est Google le responsable, mais déclarer dans la fiche
de sécurité des données et la politique de confidentialité. Risque : dépendance à un plugin.

**B. Défi de la semaine, même graine pour tous, sans serveur.** Chaque lundi, une partie courte (ex. 10 journées) avec
les mêmes clients, prix et événements pour tout le monde (le moteur sait déjà tirer au sort avec graine, `seededRng`).
Le score s'affiche et se partage par message (texte + code de contrôle) avec ses amis ; classement entre amis, à la main.
Coût 0 €. Travail **faible à moyen** : mode « partie classée » séparé, écran de résultat, bouton Partager.
Triche : possible mais sans enjeu (entre amis). RGPD : aucun compte, aucune donnée envoyée. Limite : ce n'est pas un vrai classement mondial.

**C. A + B ensemble (recommandé pour plus tard).** Le défi de la semaine (B) envoie son score au classement Google Play Jeux
(A). Même partie séparée pour tous, classement public à coût nul. À faire en deux temps : B d'abord, A ensuite si B plaît.

**D. Serveur Firebase.** Classement maison, avec pseudos, vérification des scores côté serveur. Coût : le forfait gratuit
suffit pour de petits volumes, mais la vérification demande le forfait à la carte (carte bancaire obligatoire) et
peut dépasser le gratuit vers 1 000 joueurs/jour : de l'ordre de quelques euros par mois, **mais imprévisible** (un pic ou une
attaque = facture). Travail **très élevé** (comptes, modération des pseudos, suppression de données sur demande, politique RGPD, serveur à surveiller).
Contraire à la règle « 0 € de coût de fonctionnement » et à « aucun serveur » de `CLAUDE.md`. **À écarter.**

### 9.3 Revenu mensuel, 10 000 joueurs actifs/mois

Hypothèses (écrites dans `scripts/economie.mjs`) : jours joués par mois 3 / 5 / 8 (bas / central / haut) ; pubs et achats
comme en section 3 ; commission 15 %.
Hypothèses classement (prudentes, option C ou B) : 10 / 25 / 40 % des joueurs y participent ; ils jouent 0 / +20 / +40 % de jours en plus ;
la moitié de leurs jours se passe en partie classée, où il ne reste que 1 pub récompensée sur 4 (le coffre déco) ; achats −10 % (le Pack Gérant « 3 coffres » vaut moins).
Les pubs imposées (bilan) restent. Coût de fonctionnement : 0 € dans tous les cas.

| Scénario | Ancienne commission (25 %) | **Sans classement** (15 %) | **Avec classement** | Écart | Net après cotisations (sans / avec) |
|---|---|---|---|---|---|
| Bas | 270 € | **280 €** | 267 € | −4,6 % | 221 € / 210 € |
| Central | 1 238 € | **1 263 €** | 1 209 € | −4,2 % | 995 € / 953 € |
| Haut | 4 050 € | **4 110 €** | 4 030 € | −1,9 % | 3 239 € / 3 176 € |

- **Correction de commission** : +10 / +25 / +60 € par mois (bas / central / haut), soit +2 % seulement : les achats pèsent peu face aux pubs.
- **Ce que coûte la neutralisation** : environ 50 € par mois au scénario central (−4 %). C'est la perte de pubs récompensées dans les parties classées, plus un peu d'achats.
- **Point d'équilibre** (scénario central, 25 % de participants) : le classement ne se rembourse que si ses joueurs jouent **environ +47 % de jours** en plus.
  À +20 % (hypothèse prudente) il perd 4 % ; à +60 % il gagne 2 % ; à +100 % il gagne 8 %. Un classement ne rapporte donc pas
  d'argent en lui-même, il vaut surtout par la rétention (levier n°3 de la section 5) et la visibilité (le bouche-à-oreille compte plus que 4 %).
- Le **solo** n'est pas touché : sans partie classée, coffres, bilan doublé et Pack Gérant restent identiques.

### 9.4 Recommandation franche
- **Classement mondial avec serveur (D) : ne pas faire.** Contraire aux règles du studio.
- **Classement en ligne officiel (A) maintenant : non.** Trop de travail pour un jeu qui n'a pas encore de joueurs, et sans effet prouvé sur la rétention.
- **Défi de la semaine sans serveur (B) : oui, mais plus tard**, après la V1.8 (concurrents) et après le test fermé de 14 jours
  (mesure de la vraie rétention). Version suggérée : V1.9 ou V2.0. **Décision d'étape** : si, en test fermé, la rétention à 7 jours est ≥ 8 %,
  construire B ; ensuite, ne brancher A (Google Play Jeux) que si au moins 20 % des joueurs lancent le défi.
- **Règles de la partie classée à fixer maintenant** : partie séparée (nouvelle clé de sauvegarde, sans toucher à
  la partie solo), départ identique, sans coffres d'employés ni bilan doublé, Vitesse ×3 permise mais une seule tentative comptée par semaine,
  Pack Gérant limité au confort (pas de pub imposée).
- **Ordre de priorité des chiffres** : la vraie mesure de la rétention en bêta compte plus que ce classement ; à ce jour tout reste une estimation.
