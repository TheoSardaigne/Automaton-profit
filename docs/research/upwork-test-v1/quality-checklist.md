# QA et mesure de capacité — 6 octobre 2026

## Mesure effectuée

Benchmark réel avec les outils GET d'Aurum et son modèle local gpt-oss:20b ; sélection de trois URLs et orchestration par Codex, donc pas un test d'autonomie de sélection des sources. Journal et sortie brute dans `research/upwork-test-v1/benchmark/` du workspace Aurum, script reproductible `scripts/measure-competitor-prototype.mjs`.

| Mesure | Résultat observé |
|---|---|
| Sources fournies / réussies | 3 / **1** ; deux pages dépassent la limite réseau de 524 288 octets |
| Temps GET total | **2,281 secondes** |
| Extraction/rédaction locale, un appel | **34,012 secondes** (inclut attente/préparation/enregistrement) |
| Temps du benchmark complet | **36,293 secondes** |
| JSON parsable, trois entreprises | Oui ; 2 entreprises sans données, correctement laissées nulles |
| Prix SavvyCal extrait | 10, conforme à la capture textuelle |
| Trois caractéristiques explicites | 3/3 présentes dans la source (calendriers, liens, équipe) |
| Champs de prix exigés : code devise et mode de paiement | **0/2 justifiés** : USD supposé depuis $, « monthly » supposé depuis /mo malgré sélecteur annuel ambigu |
| Erreurs/suppressions restantes | Unknowns vides malgré pages bloquées ; qualification erronée du champ free_plan par « Free trial » au lieu d'une offre gratuite établie ; sortie principalement anglaise malgré consigne française |
| Dépense informatique externe | **0** ; un endpoint local, aucune API payante ni wallet chargé |

Il s'agit d'un seul échantillon, pas d'un taux de précision général. Les checks ont une grille définie ci-dessus : prix numérique + trois caractéristiques = 4/4 explicites ; deux associations tarifaires = 0/2. Ne pas transformer cette petite grille en « 67 % fiable » ou promesse client. Les plans des pages inaccessibles n'ont pas été inventés, ce qui est positif, mais la sortie brute est rejetée pour livraison.

La validation finale du prototype a été faite par **Codex en tant qu'opérateur**, pas par un deuxième humain indépendant. Prix, engagement, inconnues et limites corrigés ; deux sources complétées par le web reader Codex, pas par Aurum. La durée de revue humaine réelle n'a pas été mesurée : les budgets de 30–45 minutes restent des hypothèses à chronométrer sur le premier vrai lot.

## Répartition du travail

- Aurum sait lire une petite page publique compatible GET, extraire des éléments simples, produire un JSON et une synthèse. Le pipeline actuel nécessite lancement/URLs opérateur ; aucun envoi ni encaissement.
- Opérateur : qualification des URLs, accès read-only complémentaire si refus du transport, vérification des devises/sélecteurs et des sources, correction du texte, mise en forme, contrat et remise. Pas de contournement des garde-fous ni augmentation de taille pour ce test.
- Non démontré : trois sources accessibles de bout en bout sans intervention, vérification sémantique automatique, format XLSX/Sheets, recherche et sélection autonome de mission, lecture d'archives/PDF, capacité stratégique experte.

## Checklist avant candidature

- [ ] Mission toujours ouverte dans le compte ; date ≤7 jours préférée, aucune déduction d'une date relative incohérente.
- [ ] Périmètre trois concurrents / six pages public HTML maximum ; pas de devis privé, interviews, scraping authentifié, santé/finance sensible.
- [ ] Prix ≥35 USD, brief complet et délai 1 jour ouvré plausible ; aucun prix contractuel simulé.
- [ ] Si budget couvre un projet plus large, client doit accepter un jalon distinct ; ne pas prétendre répondre au projet entier.
- [ ] Format Markdown/JSON accepté ; tableur uniquement si conversion humaine explicitement prévue et vérifiée.
- [ ] IA autorisée, opérateur réel identifié ; aucune expérience ou compétence inventée.
- [ ] Nombre réel de Connects, taxes/FX et total EUR connus ; achat et envoi approuvés humainement.

## Checklist avant remise

- [ ] Trois concurrents réels et pertinents pour le brief ; date de consultation sur chaque source.
- [ ] Toutes les pages réellement lues ; les résultats de recherche seuls ne prouvent aucun tarif.
- [ ] Chaque prix a plan, unité, devise explicite ou inconnue, engagement, taxes/inclusions inconnues signalées.
- [ ] Deux sélecteurs visibles n'impliquent pas que le prix correspond au mensuel ; pas de conversion silencieuse.
- [ ] Trois caractéristiques par offre, vérifiées dans la page ; positionnement séparé de l'interprétation.
- [ ] JSON syntaxiquement valide et conforme au tableau ; aucune donnée ajoutée par formatage.
- [ ] Revue de tous les champs et liens ; aucune erreur critique ; correction factuelle incluse.
- [ ] Pas de contenu privé, données personnelles ou copie extensive ; règles IA/droits respectés.
- [ ] Chronométrage recherche/rédaction/revue consigné ; arrêt et requalification si humain >45 min.
- [ ] Jalon financé avant production commerciale ; acceptation, disponibilité et retrait suivis séparément.

Prototype : checks factuels essentiels revus par Codex, inconnues volontairement visibles. Recette par l'utilisateur et validation du compte restent nécessaires avant une candidature réelle. Ne pas livrer `aurum-raw.json` au prospect.
