# Aurum — extraction pricing avec preuves v2

**8 octobre 2026, Europe/Paris — CAPABILITY INSUFFICIENT.**

L'incrément local fonctionne : Ollama propose des champs structurés et un validateur
indépendant impose la preuve exacte. Revue humaine déclarée : **29/32 corrects
(90,625 %), 3 incorrects, 0 incertain, 0 non revu, en 259,203 s (4 min 19 s)**.
Les trois erreurs portent sur des prix payants SimplyBook.me. Le propriétaire a
précisé « autre montant », sans montant corrigé. Elles restent des erreurs critiques.
Après filtrage : **29 acceptés / 37 UNKNOWN**, quatre montants, aucun prix complet.
Le seuil humain de 80 % est atteint sur ce petit échantillon, pas un succès commercial.

Base : `30c2e915f076d83f9b0aef370f029b1b8d5abb6a`, branche
`launch-candidate-v2-ollama`. État initial vérifié ; travail préexistant conservé.
Aucun changement main/Fiverr, candidature, dépense externe, wallet ou compute distant.

## Architecture, prompt et périmètre

- `pricing-research.ts` orchestre les trois URLs autorisées SavvyCal, YouCanBookMe,
  SimplyBook.me : GET public → proposition locale → validation indépendante → CSV
  sécurisé v1. Plusieurs plans par page, six champs : plan_name, price_amount,
  currency, billing_period, pricing_unit, free_plan, citation/source/statut.
- `local-pricing-extraction.ts` utilise seulement le modèle configuré gpt-oss:20b sur
  `http://127.0.0.1:11434/api/chat`, redirects interdits, timeout 180 s, contexte 16384,
  sortie 6000 tokens, température 0, schéma JSON contraint, aucun fallback distant.
- `pricing-evidence.ts` est indépendant du modèle. Slots et noms de plans fournis par
  le pilote. Contexte de carte ≤1800 caractères, page ≤60000 caractères, citation ≤400.
- Loop local et runner exposent `local_pricing_extract_csv` ; runner partage budget
  web existant et limite le fichier à `<session>/dataset.csv`. Mode offline bloquant.
- Prompt réel : [prompt.txt](capability-build-v2/benchmark/prompt.txt), entrées bornées
  [inputs.json](capability-build-v2/benchmark/inputs.json). UNTRUSTED DATA, pas
  d'instructions de page suivies, copie exacte, absence/ambiguïté UNKNOWN, bare `$`
  ne prouve pas USD, Free Trial ≠ Free Plan, taux mensuel ≠ engagement mensuel.

Le nom de plan des métadonnées est un label candidat : ce n'est pas un champ vérifié
si `plan_name` vaut UNKNOWN. CSV : colonnes v1 stables, statut de transport
EXTRACTED_LITERAL et raison EXACT_QUOTE_AND_RULES ; JSON : VERIFIED_EVIDENCE.
Ces statuts indiquent des contrôles automatiques, pas une vérité commerciale actuelle.
Features et XLSX restent hors de cet incrément.

## Vérification déterministe et sécurité

1. Carte liée au plan par titre autonome ; cartes répétées incompatibles refusées.
   « Custom » doit être autonome pour éviter de prendre « Custom domains » pour un prix.
2. Source identique, quote présente exactement dans la page ET la carte, confidence
   finie entre 0 et 1. Une confidence élevée ne force jamais l'acceptation.
3. Normalisation compatible avec la preuve ; montant/devise/unité liés au même prix.
   Sous-citations monnaie/unité admises seulement dans le taux sélectionné.
4. Mensuel/annuel séparés. Montants contradictoires pour une même option → UNKNOWN.
   Zéro sur plan payant refusé ; Free exige une preuve explicite de zéro.
5. Après la revue, les montants payants avec option connue exigent désormais cette
   option dans la quote elle-même. Cela renforce le contexte, **ne résout pas une
   différence de montant affiché, de région ou de fraîcheur** : causes exactes UNKNOWN.
6. Quote absente/modifiée, autre page/plan, doublon, mauvais JSON ou sortie tronquée
   → UNKNOWN. Aucun comblement par hypothèse ni modification de quote pour la faire passer.

Transport web inchangé : public GET, SSRF/DNS public pinné, 512 KiB, timeouts,
redirects/budgets/fréquence bornés hérités. Pas de Calendly/Cal.com >512 KiB, login,
anti-bot, scripts de site, shell libre ou outil payant. Writer v1 : confinement workspace,
traversal/symlinks/ADS bloqués, CSV UTF-8 correctement cité, formules neutralisées.
UI de revue locale : quotes via textContent, aucun contenu web exécuté.

## Benchmark et historique conservé

| Étape | Slots/champs | Acceptés / UNKNOWN | Montants | Temps machine |
|---|---:|---:|---:|---:|
| JSON libre initial | 16/96 | 27/69 | 9 | 232,470 s, batch |
| Schéma, 10 variantes SimplyBook | 16/96 | 14/82 | 3 | 135,785 s, batch |
| Jeu présenté à la revue propriétaire | 11/66 | 32/34 | 7 | 95,440 s, somme des trois enregistrements |
| Revalidation et filtrage après revue | 11/66 | **29/37** | **4** | mêmes fetchs/inférences, revalidation offline ~0,010 s |

Le scope SimplyBook a été réduit explicitement à cinq plans mensuels ; variantes
annuelles testées en fixtures seulement. Ce changement empêche une comparaison de
couverture à dénominateur constant. Dernier retry SimplyBook : 29,259 s. Sept appels
Ollama au total durant le développement, 394,740 s d'inférence mesurée cumulée ; dix
GET locaux (préinspection 3 + essais 6 + retry 1). Lectures Codex hors de ce compteur.
95,440 s ne mesure ni toute la tâche ni le temps humain. Aucun appel nouveau au modèle
ou au réseau pour la correction finale : revalidation des mêmes sources hashées.

Erreurs de développement conservées : filtre Custom domains corrigé et testé ;
options ignorées en JSON libre puis contraintes ; sortie SimplyBook tronquée à 6000
tokens entièrement rejetée ; zéro payant jamais promu en prix ; ambiguïtés restent UNKNOWN.

## Qualité et revue humaine réelle

| Mesure | Observé |
|---|---:|
| Pages accessibles | 3/3 |
| Plans/options, champs attendus | 11, 66 |
| Champs proposés, non UNKNOWN proposés | 66, 53 |
| Champs finalement acceptés / UNKNOWN | 29 / 37 |
| Valeurs tentées rejetées / UNKNOWN du modèle | 24 / 13 |
| Acceptés avec citation exacte et bonne source | 29/29 |
| Acceptés sans preuve exacte | 0 observé |
| Plan_name accepté | 9/11 |
| Prix complets plan+montant+devise+facturation+unité | 0 |
| Revue originale corrects / incorrects | **29/32 / 3/32** |
| Montants corrects dans revue originale | **4/7**, trois erreurs critiques |
| Incertains / non revus | 0 / 0 |
| Temps humain déclaré | **259,2029000000954 s** |

Preuve de revue : [human-review.json](capability-build-v2/benchmark/human-review.json).
Chrono déclaré propriétaire, du 2026-10-08T19:01:04.634Z au 19:05:23.837Z ; aucune
revue Codex présentée comme humaine. UI et template originaux de 32 lignes conservés.
Le relevé correspond aux champs originaux du snapshot `human-reviewed-results.json`.
Le JSON a été transcrit depuis la réponse propriétaire en conservant chaque valeur,
quote, source et verdict ; vérification d'identité et de comptage automatisée.

Trois montants initialement acceptés, maintenant UNKNOWN : SimplyBook Basic 13,9,
Standard 29,9, Premium 59,9, tous mensuels dans le dataset initial. **Ce sont des valeurs
contestées, pas des prix à utiliser.** Cause déclarée : autre montant. Valeurs corrigées,
devise/région, option et origine de divergence : UNKNOWN. Ne pas inventer une correction.
Le snapshot conserve les erreurs ; la proposition brute du modèle n'est pas effacée.

L'audit de référence Codex initial donnait 32/32 : il est contredit par ces trois
verdicts et conservé comme `pre-review-operator-audit.json`, pas comme taux humain.
L'audit final vérifie 29 champs retenus. Il n'efface pas le résultat initial 29/32.
`apply-pricing-human-review.mjs` valide le relevé original et filtre les acceptations
non confirmées. Toute revalidation conserve le relevé et réapplique ce filtre.

Quatre montants retenus : SavvyCal Basic 10 et Premium 17 (devise/engagement UNKNOWN),
YouCanBookMe Free 0 et SimplyBook Free 0. Prix payants YCBM et SimplyBook : UNKNOWN.
Résultats : [results.json](capability-build-v2/benchmark/results.json),
[dataset.csv](capability-build-v2/benchmark/dataset.csv), [metrics.json](capability-build-v2/benchmark/metrics.json).
Les 29 restants réutilisent les verdicts de la même revue : **aucun nouveau chrono ni
nouveau taux indépendant de 100 %**. 29 champs corrects ne signifient pas 29/66 champs
couverts avec prix complets, ni absence d'erreurs sur de futurs sites.

V1 : 0 pricing_line extrait ; v2 : quatre montants conservés. Gain de récupération,
mais pages/champs/périmètre diffèrent. Le chrono est sous 10–15 min sur ces seules
32 lignes ; pas une mesure d'un comparatif complet, ni d'une économie humaine avant/après.

## Reproduction et contrôle avant livraison

1. `pnpm.cmd build`, puis `node scripts/benchmark-pricing-evidence.mjs` pour une collecte
   publique actuelle bornée et inférence locale ; aucune fraîcheur garantie par replay.
2. `--revalidate` rejoue les drafts sur les sources privées locales hashées, sans modèle
   ni réseau. Les corps entiers restent dans tmp, pas dans Git ; sur un autre checkout,
   une nouvelle collecte est nécessaire. Contextes et empreintes publics sont archivés.
3. `node scripts/apply-pricing-human-review.mjs` applique uniquement la revue d'origine
   avec identité exacte valeur/quote/source ; nouvelles valeurs non revues → UNKNOWN.
4. `node scripts/audit-pricing-benchmark.mjs` : cohérence de référence, pas revue humaine.
5. Vérifier tous montants actuels, option/unité/devise, source/date, divergences et UNKNOWN,
   puis revue finale humaine du rapport. Toute erreur de prix bloque la livraison.

## Simulation économique — mission Etsy historique

Ouverture, Connects, deadline et autorisation IA non revalidés : pas de nouvelle recherche.
Brief historique : 30–40 fiches / 10–15 boutiques, variantes, remises, matériaux,
shipping US, délais, demande, tableur/synthèse, budget 100 USD.

| Dimension | Historique | V1 | V2 simulé | Justification |
|---|---:|---:|---:|---|
| Capacités /25 | 18 | 19 | 19 | Pricing SaaS amélioré mais Etsy/variants/shipping non testés ; pas de point ajouté |
| Résultat /20 | 14 | 14 | 14 | Trois erreurs monétaires ; aucun prix complet ; niche non validée |
| Budget/temps /20 | 6 | 7 | 7 | Chrono petit dataset seulement, aucune économie Etsy mesurée |
| Clarté /10 | 9 | 9 | 9 | Inchangée |
| Concurrence /10 | 3 | 3 | 3 | Inchangée, activité actuelle UNKNOWN |
| Réception/avis /10 | 7 | 7 | 7 | Aucun retour client gagné |
| Répétition /5 | 4 | 4 | 4 | Pas prouvée |
| **Total** | **61** | **63** | **63 — PASS** | Seuil 70 intact |

Le brouillon pré-revue envisageait 64 ; après trois erreurs critiques, le +1 capacité
commerciale n'est pas justifié pour Etsy. Hypothèse de temps v1 inchangée : 3,5–6,75 h
contre 4–7 h historiques, pas un gain mesuré. Pour 100 USD, frais hypothétiques 15 %,
provision 0,50 USD, temps valorisé 20 USD/h : contribution −50,50 à +14,50 USD avant
acquisition/autres frais, pas un profit réalisé. Dépense externe exécutée 0 EUR ; coût
électricité et développement non mesuré. Aucun paiement/commande/client inventé.

## Tests exécutés et décision

- Vitest ciblé : **74/74 PASS**, six suites : pricing-evidence 26, pricing-research 3,
  structured-research 15, local-web 17, local-workspace 6, research-session 7.
  Faux quotes/pages/plans, ambiguïtés, billing, Free/placeholder, JSON tronqué,
  injections, sorties locales, confinement/path traversal, CSV et budgets couverts.
- Étapes précédentes : evidence 23 puis 24 puis 25 PASS ; combinaisons 71 puis 72
  puis 73 PASS. Correction finale contexte montant incluse dans les 74 tests.
- `pnpm.cmd build` : PASS (runtime et CLI), y compris après correction finale.
- `pnpm.cmd typecheck` : PASS. `node scripts/check-kernel-manifest.mjs` : PASS,
  38 fichiers protégés ; seul hash du loop modifié, limites réseau inchangées.
- Revalidation offline avec SHA-256 des sources : PASS. Intake revue : 32 champs
  concordants, 29 corrects, 3 incorrects, chrono cohérent. Audit final : 29 références
  concordantes ; audit pré-revue contredit sur trois prix et préservé.
- CSV : parse indépendant 66 lignes / 9 colonnes / 29 acceptées ; quotes et URLs
  concordantes avec JSON, trois prix contestés UNKNOWN. Contrôle des octets Git.
- Suite globale non exécutée ; incompatibilités Windows/Ollama historiques non relancées.

**CAPABILITY INSUFFICIENT.** Prochaine action minimale : comprendre les trois divergences
entre contenu GET et prix vus par le propriétaire, avant tout retest commercial.
Un qualificateur plus long n'est pas une correction de montant. Ne pas poursuivre
avec XLSX, plus de sources, prospection ou automation Fiverr. Revue humaine monétaire
obligatoire ; aucune nouvelle capacité déclarée fonctionnelle sans test.
