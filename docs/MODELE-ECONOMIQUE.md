# Modèle économique et fiche de rentabilité — Ma P'tite Supérette

> Étude du 26/10/2026, demandée par Jack. Rien n'est codé ni activé : AdMob réel et produits Google Play seront
> branchés plus tard, une fois la micro-entreprise créée et avec l'accord écrit de Jack (règle de `CLAUDE.md`).
> Règle d'or du studio : **aucun jeu à perte**. Chaque version publiée doit mettre à jour cette fiche.

## 1. Les chiffres de départ (sources en fin de document)

| Donnée | Valeur retenue | Commentaire |
|---|---|---|
| Durée d'une journée de jeu | ~5 min réelles en ×1 (3 min 30 + préparation + bilan) | `GAME_MIN_PER_SEC` dans `src/data.js` |
| Durée totale du jeu | 10 à 15 h (magasin au maximum) | mesuré au robot |
| eCPM pub récompensée, France | 8 à 10 $ | la France est classée « Tier 2 » |
| eCPM interstitielle, France | 5 à 7 $ | idem |
| Valeurs prudentes utilisées | 6 € (récompensée), 4 € (interstitielle) | public francophone mélangé (Afrique, Belgique…) + taux de remplissage ~90 % |
| Rétention d'un jeu de simulation | J1 30 % · J7 8,7 % · J30 3 % | référence du marché |
| Joueurs qui achètent quelque chose | ~1 % | repère hybrid-casual |
| Commission Google Play (EEE) | 20 % + 5 % de frais de paiement = **25 %** | nouvelles installations, règles 2026 |
| Cotisations micro-entreprise | **21,2 %** du chiffre d'affaires | revenus pub = BIC prestations « le plus souvent » ; à confirmer à l'inscription |
| Coût de fonctionnement du jeu | **0 €** | pas de serveur, pas d'API, pas d'IA payante |

## 2. Le modèle recommandé

### 2.1 Pubs récompensées (facultatives) — le moteur principal
Le joueur **choisit** de regarder une pub contre un bonus. Personne n'est forcé, donc ça ne fait pas fuir.
- **Livraison express** : la commande arrive tout de suite.
- **Bilan doublé** : ×2 sur le bénéfice de la journée, une fois par journée de jeu (seulement si le bénéfice est positif).
- **Coup de pub du quartier** : +20 % de clients le lendemain.
- **Remonter la réputation** : +0,2 étoile après une mauvaise journée.
Limite : 2 pubs récompensées maximum par journée de jeu (sinon elles deviennent obligatoires dans la tête du joueur).

### 2.2 Pubs imposées (interstitielles) — idée de Jack, calibrée
- **Une pub toutes les 3 journées de jeu, uniquement au bilan de fin de journée**, jamais pendant qu'on joue.
- En ×1, ça fait **une pub toutes les ~15 min** ; en ×3, toutes les ~8 min. C'est 2 à 4 fois moins que la plupart des jeux du genre.
- Jamais avant le jour 3, jamais dans le tutoriel, jamais deux pubs à moins de 4 minutes réelles d'écart.
- Une pub récompensée regardée volontairement dans la journée **repousse** la prochaine pub imposée : on récompense le joueur coopératif.

### 2.3 Achats intégrés (jamais de pièces à vendre, pas de diamants)
| Produit | Prix | Contenu | Avis |
|---|---|---|---|
| **Vitesse ×3** | 0,89 € | débloque le ×3 pour toujours (×1 et ×2 restent gratuits) | idée de Jack ; achat de confort, parfait |
| **Pack Gérant** | 2,99 € | plus aucune pub imposée + ×3 + **un caissier 5 étoiles offert pendant 2 semaines de jeu** (une seule fois) | idée de Jack, voir la remarque ci-dessous |

Les pubs récompensées restent disponibles avec le Pack Gérant (le joueur garde ses bonus s'il le veut).

**Remarque honnête sur le caissier 5 étoiles** : c'est un avantage payant, alors que la règle actuelle de `CLAUDE.md`
dit « achats de confort seulement ». C'est acceptable parce que le jeu est **solo** (on ne bat personne en payant)
et que le bonus est **unique et limité** (2 semaines de jeu ≈ 1 h 10 réelles sur 10-15 h). Il ne faut **jamais**
en faire un achat répétable. Jack doit valider cette exception, et la règle de `CLAUDE.md` sera ajustée en conséquence.

## 3. Ce que rapporte un joueur

Calcul pour un joueur actif **un jour donné** (environ 25 min de jeu, soit 5 journées) :
- 1,5 pub imposée × 4 € / 1 000 = 0,006 €
- 1,5 pub récompensée × 6 € / 1 000 = 0,009 €
- Achats : 1 % des joueurs × 2,50 € en moyenne, net de la commission Google, étalés sur leur durée de vie ≈ 0,005 € par jour actif
- **Total ≈ 0,02 € par joueur actif et par jour** (cohérent avec le repère du marché : 0,01 à 0,05 $ pour un jeu casual à pubs)

Un joueur qui installe le jeu joue en moyenne ~4,4 jours au total (avec la rétention ci-dessus).
**Valeur d'une installation ≈ 0,09 €** avant cotisations, ≈ **0,07 € net**.

## 4. Fiche de rentabilité — 3 scénarios

Valeur d'une installation : pessimiste 0,04 € · moyen 0,09 € · optimiste 0,20 €.
Cotisations : 21,2 %. Objectifs exprimés en **revenu net par mois**.

| Objectif | Net visé / mois | Chiffre d'affaires nécessaire | Joueurs actifs par jour (moyen) | Installations par mois (pessimiste / moyen / optimiste) |
|---|---|---|---|---|
| 1. Payer les abonnements IA (~45 €) | 45 € | 57 € | ~95 | 1 400 / 630 / 290 |
| 2. Mi-temps sur le chantier (~900 € net) | 900 € | 1 140 € | ~1 900 | 28 500 / 12 700 / 5 700 |
| 3. Quitter le chantier (~1 800 € net) | 1 800 € | 2 285 € | ~3 800 | 57 000 / 25 400 / 11 400 |

**Risque de perte : 0 €.** Avec 0 € de frais propres au jeu, le pire cas est « ça ne rapporte presque rien », jamais « ça coûte ».

## 5. Conclusions franches
1. **Objectif 1 (payer les abonnements) : réaliste** avec un seul jeu, s'il trouve quelques centaines de joueurs par mois.
2. **Objectifs 2 et 3 : pas réalistes avec un seul jeu** de ce type sans publicité payante. 12 000 à 25 000 installations
   par mois, c'est un vrai succès sur le Play Store. La voie réaliste est **le studio** : plusieurs jeux qui rapportent
   chacun un peu (5 jeux à 2 500 installations/mois ≈ objectif 2 dans le scénario moyen), et le meilleur que l'on
   pousse davantage.
3. Le levier le plus fort n'est pas le nombre de pubs, c'est **la rétention** (que les joueurs reviennent) : passer
   de 3 % à 6 % de joueurs encore là au bout d'un mois double presque les revenus, sans une seule pub de plus.
   Les objectifs du jour, les événements de quartier et la progression jusqu'au niveau 15 servent exactement à ça.
4. Plafond de la micro-entreprise : 83 600 € de chiffre d'affaires par an, largement au-dessus de ces scénarios.

## 6. À faire plus tard (pas maintenant)
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
