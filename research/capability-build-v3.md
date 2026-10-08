# Aurum — état tarifaire SimplyBook.me v3

8 octobre 2026, Europe/Paris. **V3 PENDING OWNER REVIEW — aucun succès déclaré.**

Base validée `29ac24b00089dbe33b13aca9c3c2db5d30c1e8f1`, branche
`launch-candidate-v2-ollama`. Status/branche/log -10 vérifiés avant édition ; aucun
changement suivi préexistant, fichiers non suivis préservés. Aucun changement main,
Fiverr, recherche Upwork, candidature, wallet, dépense ou limite réseau.

## Problème et incrément minimal

V2 a conservé des citations de montants que le propriétaire a rejetés : Basic 13,9,
Standard 29,9, Premium 59,9. Cause déclarée « autre montant » ; valeurs corrigées,
option, devise et état d'affichage inconnus. Une citation exacte n'est pas une
certification du prix applicable. V3 sépare les offres et impose une revue du tuple.

`pricing-state.ts` ajoute un modèle typé : entity, plan_name, amount, currency,
billing_commitment, displayed_rate_period, pricing_unit, locale, source_url,
accessed_at, exact_evidence_quote et evidence_status. Des métadonnées supplémentaires
conservent la preuve du contexte, la complétude automatique, le canal de capture,
la date de référence éventuellement écrite dans la source et la raison du statut.

- `billing_commitment` = monthly / annual / UNKNOWN.
- `displayed_rate_period` = month / year / UNKNOWN, distinct de l'engagement.
- Un taux de 11,9 par mois facturé annuellement ne devient jamais un contrat mensuel,
  et n'est pas multiplié par 12 pour inventer un total contractuel.
- `locale` = langue du chemin URL en/fr, **pas pays, région fiscale ou devise choisie**.
- `pricing_unit` = unité littérale month/year dans ce pilote ; aucune unité par siège
  ou entreprise inventée. Pays, fiscalité, sélection de devise et onglet actif UNKNOWN.
- Capture `PUBLIC_GET_STATIC_TEXT` : tous les tarifs présents dans le texte, pas
  affirmation que ces tarifs sont visibles simultanément dans un navigateur.

Le scope fixe permet un parseur littéral déterministe EN/FR et une table de comparaison
à structure explicite. Aucun nouvel appel Ollama n'est nécessaire pour associer ces
qualificateurs. La chaîne sémantique v2 reste disponible sans modification ; une
proposition de modèle éventuelle passe `verifyPricingState`, qui exige exactement
l'offre indépendamment énumérée. Le LLM ne choisit aucun prix et ne résout aucun conflit.

`pricing-state-research.ts` collecte au plus trois URLs officielles exactes et expose
`local_pricing_state_csv` dans le loop local/runner. CSV confiné, budget web partagé,
mode offline bloquant, sans navigateur ni shell. Ce pilote n'est pas un parseur général.

## Sources et état de page

Sources réellement collectées, GET sans compte :

- [Pricing EN](https://simplybook.me/en/pricing).
- [Tarifs FR](https://simplybook.me/fr/tarifs), canonique publique de /fr/pricing.
- [Comparaison officielle SimplyBook / Calendly](https://simplybook.me/en/simplybook-vs-calendly).

Seule la section intitulée SimplyBook.me Pricing est lue dans la comparaison ; les
prix Calendly et la prose adjacente sont exclus. La comparaison porte la référence
April 2026, enregistrée séparément de la date d'accès ; ne pas la présenter comme
publication récente. L'absence de divergence de montant dans ce snapshot ne prouve
pas que ce contenu est à jour pour tous les visiteurs.

Diagnostic distinct : le lecteur web a montré des symboles `$` là où les GET locaux
ont montré `€` sur les pages pricing EN/FR. `$` ne démontre pas USD ; le lecteur web
ne prouve pas non plus un état de navigateur authentifié ou une région. Cette
observation n'est pas intégrée comme une offre vérifiée et n'explique pas, à elle
seule, les trois erreurs du propriétaire. Elle renforce le besoin de comparer le
montant, la devise et le mode effectivement affichés pendant la revue.

`benchmark/sources.json` conserve extraits bornés, URL demandée/finale, access date,
empreinte SHA-256 du texte intégral et de l'extrait. Les extraits reproduisent exactement
les tuples issus des captures intégrales ; le replay ne garantit aucune fraîcheur.

## Validation et conflits

Le validateur indépendant exige une seule carte liée au plan, la bonne source,
une date valide, montant présent dans la quote exacte, devise démontrée, unité et
facturation démontrées. Quotes ≤400 caractères, preuve du contexte ≤800, page ≤60000.
FR : Gratuit→Free, Basique→Basic, avec association explicite au titre source.
Table officielle : colonnes Monthly et Annual (per month) utilisées uniquement si
le header et les deux montants de la ligne sont démontrés exactement. La preuve du
header est conservée avec la quote complète de la ligne ; le montant est associé
par position aux colonnes, pas par une interprétation du LLM.

Quote absente/modifiée, mauvais plan/page, devise ambiguë, zéro payant, carte répétée,
option non démontrée ou source inaccessible → UNKNOWN. Confiance d'un modèle sans effet.

Le réconciliateur conserve les deux offres, ne fusionne ni engagements ni devises :

| Classe | Règle | Effet |
|---|---|---|
| BILLING_MODE_DIFFERENCE | Engagements différents prouvés, devise/unité identiques | Deux offres distinctes conservées |
| CURRENCY_OR_LOCALE_DIFFERENCE | Devises différentes démontrées | Deux offres, aucune conversion ; une langue seule n'explique pas un montant différent |
| STALE_SOURCE_POSSIBLE | Divergence avec référence temporelle différente | Conflit bloqué, pas cause affirmée |
| RENDER_STATE_DIFFERENCE | Divergence entre canaux de capture différents | Conflit bloqué, pas prix choisi |
| UNEXPLAINED_CONFLICT | Même contexte mais valeurs différentes sans preuve d'explication | Les deux valeurs bloquées |

Un conflit inexpliqué donne CONFLICT_REQUIRES_REVIEW et ne peut être effacé par un
simple verdict CORRECT. Il exige une preuve expliquant la différence, puis un nouveau
jeu source/contextes contrôlé. Une revue INCORRECT reste UNKNOWN, sans montant corrigé inventé.

**Statut final livrable :** VERIFIED_PRICING_STATE seulement si contexte complet,
aucun conflit bloquant ET confirmation propriétaire de l'identité exacte du tuple.
Avant cette revue, les candidats complets restent UNKNOWN avec la raison
CONTEXT_BOUND_OWNER_REVIEW_REQUIRED. Un état validé est daté, pas un prix universel.

## Sécurité

GET public hérité exclusivement : SSRF/DNS public pinné, 512 KiB, timeout 12 s,
redirects 3, fréquence et quotas existants, contenu UNTRUSTED. Aucun contournement,
login, cookie de compte, script site, baisse de limite ou grosse page Calendly/Cal.
Le writer sécurisé vérifie workspace, symlink/traversal/ADS avant toute collecte ;
CSV 16 colonnes stables, UTF-8, CRLF, guillemets/virgules/newlines et formules neutralisées.
UI locale : données via textContent, payload échappé, liens manuels officiels seulement.
Aucun script de site exécuté. Aucun endpoint modèle/distant ajouté, 0 appel d'inférence.

## Benchmark retenu : faits machine, pas résultats humains

| Mesure | Observé |
|---|---:|
| Pages attendues / accessibles | 3 / 3 |
| Plans / engagements par page | 4 / 2 |
| Offres attendues / montants trouvés | 24 / 24 |
| Candidats avec contexte complet selon règles | 24 / 24 |
| Tuples distincts plan/montant/devise/engagement/taux/unité | 8 |
| Paires de différences détectées | 27 |
| Différences expliquées BILLING_MODE_DIFFERENCE | 27 |
| Conflits inexpliqués entre GET retenus | 0 |
| VERIFIED_PRICING_STATE avant propriétaire | **0** |
| UNKNOWN en attente revue | **24** |
| Montants corrects / faussement acceptés selon propriétaire | **UNKNOWN / UNKNOWN** |
| Temps humain réel / UI plus simple que v2 | **UNKNOWN / UNKNOWN** |
| Durée batch machine retenue | **0,950 s** |
| Replay offline machine | **0,004 s** |
| Inférence / dépense externe | 0 appels / 0 EUR |

Les 27 paires ne sont pas 27 problèmes commerciaux : trois plans payants × neuf
combinaisons source-mensuel/source-annuel. Il s'agit de trois différences tarifaires
par plan, répétées entre sources ; Free reste deux engagements séparés à zéro.

Valeurs **candidates non encore validées** du snapshot EUR : Free 0/0, Basic 13,9
mensuel et 11,9 annuel par mois, Standard 29,9/24,9, Premium 59,9/49,9. Elles ne
remplacent pas les verdicts INCORRECT v2. Seule la revue des deux options et de la
devise réellement affichées peut confirmer ou contester ces nouveaux tuples.

Le benchmark retenu comprend trois GET. Préinspection trois GET et un premier
benchmark trois GET conservés seulement comme développement ; ce premier essai a
échoué au contrôle de replay car le délimiteur final de la table avait été omis dans
l'extrait. Correction testée par l'égalité intégral/extrait, sans changer de montants.
Une tentative initiale a échoué sur le chemin d'audit encodé (Th%C3%A9o) : corrigé
avec path.resolve, aucun chemin externe écrit. Ces temps ne sont pas additionnés
au batch retenu. Aucun achat ni réseau supplémentaire pour le replay.

## Revue, reproduction et critère de succès

[human-review.html](capability-build-v3/benchmark/human-review.html) présente **12 lignes**
(4 plans × 3 sources), côte à côte mensuel / annuel par mois, devise, source/date,
quote exacte, contexte et statut. Deux verdicts par ligne, commentaires pour différences,
chrono start/stop, export local JSON, appréciation explicite « plus simple que v2 ».
Aucun verdict prérempli. [review-protocol.md](capability-build-v3/benchmark/review-protocol.md).
La demande de revue propriétaire a été faite ; son absence n'est pas un résultat zéro.

Commandes :

1. `pnpm.cmd build`.
2. `node scripts/benchmark-pricing-state.mjs` — trois GET publics bornés, aucun modèle.
3. `node scripts/benchmark-pricing-state.mjs --replay` — extraits hashés, aucun réseau.
4. `node scripts/create-pricing-state-review.mjs` — UI et template sans faux résultats.
5. Après relevé propriétaire placé dans benchmark/human-review.json :
   `node scripts/apply-pricing-state-review.mjs` — vérifie identité des 24 tuples,
   compteurs, dates et chrono ; conserve captures d'origine et écrit reviewed-results /
   reviewed-metrics + CSV filtré. Aucune correction de montant automatique.

Succès seulement après revue complète sans erreur monétaire, séparation correcte
mensuel/annuel, conflits bloqués et UI plus simple confirmée. Les 24 acceptations
machine ne comptent pas comme 24 prix corrects ; aucun 100 % humain déclaré avant relevé.
Un éventuel succès sur ce pilote ne validera pas tous sites/régions ou une mission client.

## Tests exécutés

- Premières suites v3 : 23/23 PASS (pricing-state 20, pricing-state-research 3).
- Combiné : **98/98 PASS**, neuf suites : nouvelles 23 + UI 1, evidence v2 26,
  pricing-research 3, structured-research 15, web 17, workspace 6, session 7.
- Tests de propositions inventées sur neuf dimensions ; EN/FR, plans/modes séparés,
  période affichée, bonne source, $, placeholders, cartes répétées, source privée,
  page inaccessible, CSV et path traversal. Cinq classes de conflit testées ; aucun
  conflit inexpliqué ne devient vérifié par le seul verdict humain.
- Build runtime/CLI PASS ; typecheck PASS ; manifeste **38 fichiers PASS**,
  seul hash du loop modifié, réseau inchangé.
- Benchmark réel 3/3, égalité des tuples intégral/extraits et replay hashé PASS.
- Parse CSV Python indépendant : **24 lignes / 16 colonnes**, quotes et sources
  identiques au JSON, tout en attente propriétaire. Contrôle d'octets CSV Git.
- UI : premier fichier bloqué par des newlines mal échappés en JavaScript. Corrigé avec String.raw ; test du script réellement émis dans un VM/DOM simulé : 12 lignes, 24 sélecteurs, start/stop/chrono/export sans verdict inventé. Ce test technique ne remplace pas une revue humaine dans un navigateur.
- Suite globale non relancée (incompatibilités historiques Windows/Ollama connues).

## Décision

**PENDING OWNER REVIEW — V3 NON VALIDÉE À CE STADE.** Incrément construit et testé,
mais aucune revue humaine v3 mesurée ni preuve de simplicité encore reçue.
Ne pas recalculer Upwork, chercher des missions, modifier Fiverr ou étendre le scope.
La prochaine action est la revue chronométrée des deux offres par plan/source, avec
les valeurs observées si différentes. Une divergence non expliquée bloque la livraison.
