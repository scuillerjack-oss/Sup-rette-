# Modèle économique et fiche de rentabilité — Ma P'tite Supérette

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
| Commission Google Play (EEE) | 20 % + 5 % de frais de paiement = **25 %** | nouvelles installations, règles 2026 |
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
- Achats : 1 % des joueurs × 2,50 € en moyenne, net de la commission Google, étalés sur leur durée de vie ≈ 0,005 €
- **Total ≈ 0,026 € par joueur actif et par jour** (repère du marché : 0,01 à 0,05 $ pour un jeu casual à pubs)

Un joueur qui installe le jeu joue en moyenne ~4,4 jours au total (avec la rétention ci-dessus).
**Valeur d'une installation ≈ 0,11 €** avant cotisations, ≈ **0,09 € net**.

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
- Cotisations micro-entreprise 2026 : lecoindesentrepreneurs.fr
- Fiscalité d'une app mobile : hayot-expertise.fr
