# Aurum — capability build v1

Date : **8 octobre 2026, Europe/Paris**. Branche : `launch-candidate-v2-ollama`.

**Décision : CAPABILITY INSUFFICIENT** pour rendre le brief Etsy à 61/100 éligible.
La collecte multi-page littérale et le CSV sont fonctionnels et testés. Le benchmark
ne valide ni une extraction complète des prix/plans, ni une prestation autonome rentable.
Pas de XLSX, de recherche Upwork, de modification Fiverr, de candidature ou de dépense.

## 0. État initial et travail préservé

Phase 0 exécutée avant édition : `git status --short`, `git branch --show-current`,
`git log --oneline -10`, inspection des différences et outils existants.
HEAD initial `d6a8d6f` ; aucune modification suivie en attente. Fichiers non suivis
préexistants préservés : PDF dupliqué à la racine, `output/`, `tmp/`, `pr409.patch`.
Ils ne font pas partie de cet incrément. `main` n'est ni checkoutée ni modifiée.

## 1. Architecture ajoutée

`src/agent/structured-research.ts` expose `local_research_extract_csv` dans le loop
Ollama local et le runner de recherche à budget nul. Entrée : 1–20 pages publiques,
entity/URL et 1–10 critères par page. Chaque critère fournit un nom, un texte exact
`needle` et le mode `literal` ou `line`. Aucun regex fourni par l'agent.

La capacité réutilise `local_web_fetch`, son transport GET public et son budget,
puis `local_write_file`. Le runner partage son plafond total de 20 requêtes entre
search, fetch, redirects et extraction ; l'outil ne crée pas un budget parallèle.
En mode offline, extraction et recherche web sont interdites. Le runner n'autorise
que `<session>/dataset.csv` pour ce nouvel export ; les quatre livrables historiques
restent nécessaires et leur confinement ne change pas.

Déduplication des URLs canoniques, fragments ignorés, cache limité au batch ; les
labels d'entités distincts conservent leurs lignes et leur provenance. Champs CSV
dans un ordre fixe : `entity, source_url, requested_url, access_date, field, value,
evidence, status, reason`. Date ISO UTC au moment du relevé, URL finale et URL demandée.

`EXTRACTED_LITERAL` signifie uniquement texte réellement présent dans la réponse
non exécutée. Ce n'est **pas** une certification du sens commercial du champ.
Le mode `line` accepte une seule ligne distincte de 300 caractères maximum ;
ambiguïté, absence, accès impossible ou ligne trop longue donnent `UNKNOWN`, extrait
vide et raison explicite. Le mode `literal` conserve un contexte court, ≤300 caractères.
Les marqueurs sont sensibles à la casse. Aucun modèle ne complète les valeurs absentes.

## 2. Sécurité

- Transport inchangé : GET seulement, DNS public vérifié/pinné, SSRF, réseaux privés,
  credentials URL, ports non standard et types binaires bloqués. Aucun cookie/login,
  navigateur, exécution de page, proxy anti-bot ou fallback contournant un refus.
- Limites héritées : 512 KiB par réponse, 60 000 caractères rendus, timeout 12 s,
  trois redirects maximum, 30 tentatives/10 min par processus ; budget de session
  partagé lorsqu'il est fourni. Le batch est séquentiel, ≤20 pages et ≤200 lignes.
- URLs invalides/locales rejetées avant la première requête du batch. Un échec
  autorisé reste partiel et ne transforme pas une page bloquée en donnée vérifiée.
- Tout résultat conserve `UNTRUSTED_WEB_DATA` ; une instruction trouvée dans une
  page reste du texte, jamais une directive. Revue de pertinence indispensable.
- Chemin CSV validé avant réseau ; confinement workspace existant, traversal,
  chemins absolus, symlinks et noms sensibles bloqués. Le nouveau point d'entrée
  refuse aussi `:` (flux ADS Windows), NUL et chemins >2048 caractères.
- Écriture UTF-8, CRLF, ordre fixe, tous les champs cités, guillemets doublés ;
  virgules et retours ligne conservés. Préfixe apostrophe pour cellules susceptibles
  d'être interprétées comme formules de tableur. Le JSON conserve le texte original.
  `.gitattributes` préserve les octets du CSV benchmark (y compris espaces des extraits)
  plutôt que laisser Git réécrire ses retours ligne à chaque checkout Windows.
- Limite d'écriture 256 KiB ; un refus de sauvegarde reste un échec, jamais une
  annonce fictive d'export. Un fichier existant **dans** le workspace peut être remplacé.
  Les protections héritées ne constituent pas une isolation OS contre un processus
  local hostile modifiant les chemins pendant l'écriture.

## 3. Tests effectivement exécutés

| Commande / contrôle | Résultat |
|---|---|
| Vitest initial : structured-research, local-web-tools, local-workspace-tools | **37/37 PASS**, 3 fichiers |
| `pnpm.cmd typecheck` | PASS |
| Vitest après intégration runner | **44/44 PASS**, 4 fichiers |
| Vitest final avec provenance redirect et refus de sauvegarde | **45/45 PASS**, 4 fichiers : 15 + 17 + 6 + 7 |
| `pnpm.cmd build`, trois exécutions | PASS, runtime + CLI |
| `node scripts/check-kernel-manifest.mjs`, trois exécutions | PASS, **38 fichiers** ; manifeste régénéré avec la modification du loop |
| Parseur indépendant Python `csv.DictReader` sur dataset réel | PASS, **30 lignes / 9 colonnes**, égalité intégrale avec les lignes JSON |
| Comparaison binaire `git show HEAD:.../dataset.csv` / fichier benchmark | PASS après renormalisation explicite avec `-text` ; octets conservés |

Les 15 cas de la nouvelle suite couvrent plusieurs URLs, pages 403/exception,
donnée absente, source dupliquée/fragments, ambiguïté, preuve trop longue, URL privée,
localhost, credentials/schéma interdit, bornes, CSV spécial/UTF-8, formule,
traversal/chemin absolu/ADS, provenance après redirect, refus de sauvegarde et export réel/symlink. Les tests runner couvrent aussi
le confinement `dataset.csv` et l'interdiction en offline. Suite globale non lancée :
aucun besoin de répéter les incompatibilités historiques Windows déjà documentées.

## 4. Benchmark public réel

Exécution : **08/10/2026, 19:55:21 CEST**, script fixe
`scripts/benchmark-structured-research.mjs`. Aucun appel au modèle, wallet ou API payante.
Critères déclarés avant fetch, non adaptés après observation : sur homepage,
`scheduling`, `integrations` et contrôle volontairement absent ; sur pricing,
`Free`, ligne `$` et même contrôle absent. Deux pages par concurrent, trois champs/page.

| Concurrent / URLs demandées | Réussites / demandes | Observation |
|---|---:|---|
| [Calendly](https://calendly.com/) / [pricing](https://calendly.com/pricing) | 0/2 | Réponses >512 KiB, refus conservés |
| [SavvyCal](https://savvycal.com/) / [pricing](https://savvycal.com/pricing/) | 2/2 | HTTP 200 ; 1 extrait littéral |
| [Cal.com](https://cal.com/) / [pricing](https://cal.com/pricing) | 0/2 | Réponses >512 KiB, refus conservés |
| [YouCanBookMe](https://youcanbook.me/) / [pricing](https://youcanbook.me/pricing) | 2/2 | HTTP 200 ; 3 extraits littéraux |
| [SimplyBook.me](https://simplybook.me/en/) / [pricing](https://simplybook.me/en/pricing) | 2/2 | HTTP 200 ; 3 extraits littéraux |

**Durée batch mesurée : 3,404 s**, incluant fetch/extraction/écriture CSV, hors revue
et écriture des fichiers JSON de mesure. 10 pages demandées, 10 uniques, 6 réussies,
4 échecs transport/taille. 30 champs attendus : **7 extraits littéraux, 23 UNKNOWN**.
Les 10 contrôles absents sont tous UNKNOWN ; les 20 critères métier simples donnent
7 correspondances et 13 UNKNOWN, soit **35 % de couverture littérale**, pas de réussite
sémantique. Aucun des **5 champs pricing_line** n'est résolu. Sources/preuves exactes
vérifiées automatiquement sur les **7/7 extraits** ; zéro erreur d'association ou de
copie observée sur eux. Ce contrôle ne certifie pas le contexte, les plans ou la devise.

Détails reproductibles : [input](capability-build-v1/benchmark/input.json),
[metrics](capability-build-v1/benchmark/metrics.json),
[résultat](capability-build-v1/benchmark/result.json),
[CSV](capability-build-v1/benchmark/dataset.csv).
Ni corps complets des pages ni logs privés ajoutés au dépôt.

## 5. Revue de l'échantillon et temps humain

Inspection des extraits par Codex, distincte d'une revue humaine indépendante :

| Échantillon | Vérification / limite |
|---|---|
| SavvyCal, scheduling | Extrait sur les liens de réservation et domaine personnalisé ; texte et source cohérents |
| YouCanBookMe, scheduling | Extrait décrit une solution de scheduling ; cohérent |
| YouCanBookMe, integrations | Extrait sur les intégrations Analytics ; cohérent, ne prouve pas toutes les intégrations ni leurs plans |
| YouCanBookMe, Free | Mot retrouvé près d'une section Free ; prix payants rendus à zéro dans la page statique publique : **ne pas accepter ces zéros comme prix commerciaux** |
| SimplyBook.me, Free | Premier match dans le titre **Free Trial** : **ne prouve pas un plan gratuit**, interprétation du champ rejetée |

**5 extraits inspectés, 5 copies exactes ; 3 contextes simples cohérents, 1 nécessitant
une qualification de plan/prix, 1 impropre à l'interprétation “plan gratuit”.** Le label
`free_plan_literal` du benchmark reste une intention de critère, pas un fait livré.
Cette limite démontre pourquoi présence d'un mot ≠ validation d'une fonctionnalité.
Les vues publiques primaires SavvyCal, YouCanBookMe pricing et SimplyBook pricing ont
été consultées pour ce contrôle ; ces lectures supplémentaires ne sont pas incluses
dans les 10 pages demandées par le batch.

Temps humain réel **NON MESURÉ**, aucun opérateur indépendant n'a revu/chronométré ce
lot. Estimation seulement : **30–60 min** pour configurer les critères, contrôler les
7 extraits et examiner les 23 UNKNOWN, sans résoudre les pages refusées ni tous les
prix. Temps Aurum/Ollama de production **NON MESURÉ : 0 appel modèle dans ce benchmark**.
Le temps Codex de développement/revue n'est pas du temps Aurum ni un coût externe nul.

## 6. Simulation économique du brief Etsy à 61/100

Source historique : [screening 07/10](../docs/research/upwork-screening-2026-10-07.md).
Brief : 30–40 fiches / 10–15 boutiques, variantes/prix/remises, matériaux,
personnalisation, livraison US, délais et indicateurs de demande, tableur/synthèse,
100 USD fixes. **Ouverture actuelle, deadline, Connects et mode de production autorisé
NON REVALIDÉS**. Aucune nouvelle recherche ni candidature.

| Dimension | Avant | Après, simulation prudente | Justification |
|---|---:|---:|---|
| Capacités /25 | 18 | **19** | Provenance multi-page et CSV réels ; variants/shipping et grand lot non testés |
| Résultat /20 | 14 | **14** | Copie fiable, mais absence de prix résolus et pertinence des matches non certifiée |
| Budget/temps /20 | 6 | **7** | Export réduit la saisie ; gain complet non mesuré, hypothèse modeste |
| Clarté /10 | 9 | **9** | Brief inchangé |
| Concurrence /10 | 3 | **3** | Aucune amélioration due au code ; état actuel non vérifié |
| Réception/avis /10 | 7 | **7** | Pas de client, de preuve qualité sur cette niche ou d'avis gagné |
| Répétition /5 | 4 | **4** | Potentiel inchangé |
| **Total** | **61** | **63** | **PASS** |

Hypothèse de gain humain **15–30 min** sur préparation du tableur/provenance, pas sur
les difficultés Etsy. Avant 4–7 h ; après hypothétique **3,5–6,75 h** ; jamais un temps
mesuré ou un gain automatique. À 100 USD, commission hypothétique 15 %, provision
production 0,50 USD et revue valorisée 20 USD/h : contribution avant acquisition
**−55,50 à +4,50 USD avant**, **−50,50 à +14,50 USD après**, selon extrêmes hypothétiques.
Puis retirer Connects, temps de candidature, retrait/FX, taxes et coûts réels non connus.
Les 15–30 min ne remboursent pas automatiquement le développement ; coût temps dev
non chronométré, amortissement inconnu. Aucune recette, marge réalisée ou capacité
Etsy suffisante déclarée. Aucun seuil baissé.

## 7. Décision suivante

**CAPABILITY INSUFFICIENT.** Le socle de collecte/export fonctionne, mais le benchmark
échoue au critère commercial essentiel des prix comparables. Ne pas relancer une
candidature à 63/100. Ne pas construire XLSX, synthèse ou pipeline complet aujourd'hui.

Avant tout prochain incrément : faire approuver un seul test de capture contextuelle
plan/prix/unité sur quelques pages accessibles, avec attentes explicites et revue
chronométrée. Ne pas augmenter les limites réseau ni contourner les refus de grandes
pages. La présence littérale et un CSV correct restent des aides à la revue, pas une
preuve de livraison autonome. Prochaine requalification marché uniquement après
mesure d'un gain humain à qualité comparable. Offre Fiverr et protections financières
préservées ; aucune action commerciale exécutée.
