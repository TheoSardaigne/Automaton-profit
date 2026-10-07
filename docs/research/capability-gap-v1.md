# Capability gap v1 — analyse des six PASS Upwork

**7 octobre 2026 — décision recommandée : BUILD CAPABILITY.** Construire ensuite un petit pilote technique, pas toute une plateforme. **Aucune capacité construite ou déclarée fonctionnelle dans cette analyse.** Aucun nouvel appel web, recherche Upwork, test Ollama, achat, financement de wallet, candidature ou changement Fiverr effectué.

Base : [six briefs examinés aujourd'hui](upwork-screening-2026-10-07.md), [benchmark local mesuré](upwork-test-v1/measurement.json), [contrôle qualité](upwork-test-v1/quality-checklist.md), lecture du code local actuel. Les chiffres de temps des missions sont des **estimations antérieures**, pas des mesures d'exécution. Six missions = petit échantillon, insuffisant pour déduire fréquence de demande ou volume de revenus futur. Résultat commercial du jour maintenu : 6 examinées, 0 ≥70, meilleur score 61, 0 dépense/Connect, WAIT.

## 1. Capacités actuelles : ce qui est établi

Code actuel : GET public avec contrôle des URLs/IP/DNS et adresse épinglée, 3 redirections maximum, timeout 12 s, corps limité à **512 KiB**, sortie 60 000 caractères, maximum **30 requêtes/10 min** et budget de session partagé avec recherche/redirections. Pas d'accès authentifié ni de navigateur pour sélectionner variantes/panier. Workspace : lecture **128 KiB**, écriture **256 KiB** par fichier, chemins confinés et liens symboliques bloqués. Un texte UTF-8 contenant des virgules peut être écrit ; cela **ne démontre pas** un export CSV fiable ni une génération XLSX sûre. Références : `src/agent/local-web-tools.ts`, `src/agent/local-workspace-tools.ts`.

Benchmark local existant : trois URLs imposées, **1 GET réussi sur 3**, deux refus pour taille ; **36,293 s** au total, dont **34,012 s** d'extraction locale. Prix numérique et trois features explicites correctement retrouvés sur la source accessible, mais **USD et facturation mensuelle supposés à tort**, confusion essai gratuit/offre gratuite et inconnus incomplets. Un échantillon ne fournit pas un taux général de précision. Trois concurrents autonomes de bout en bout, revue humaine chronométrée, 5–10 acteurs, XLSX et citation sémantique automatique **non démontrés**.

Le PDF de portfolio a été produit par l'opérateur avec un générateur externe au jeu d'outils Aurum. Il ne prouve pas qu'Aurum sait seul générer un PDF, traiter Etsy ou rechercher un marché. Préserver cette séparation dans les futurs tests.

## 2. Taxonomie des PASS

Codes demandés : **1** technique ; **2** périmètre ; **3** temps humain ; **4** accès/difficulté des données ; **5** concurrence ; **6** budget ; **7** expertise spécialisée ; **8** qualité ; **9** plateforme/statut ; **10** autre contrainte client ou personnelle.

P = cause déterminante ; S = facteur secondaire documenté ou analyse explicitée ; ? = information à vérifier, pas cause prouvée ; — = pas établi. Les exigences d'un client ne deviennent pas une interdiction générale de la plateforme.

| Mission / score / budget | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Etsy Product & Market Research / **61** / **100 USD** | P | P | P | P | S | P | S | P | ? | — |
| Quick 3 Competitors DTC / **56** / **5 USD** | S | — | S | ? | ? | P | — | S | P | — |
| D2C White-label / **47** / **700 affichés, 150 initial** | S | P | ? | P | S | ? | P | P | ? | P |
| Digital PR B2B Software / **37** / **250 indicatifs** | S | P | ? | P | S | ? | P | P | ? | P |
| Data Entry & Web Research / **40** / **5 USD** | S | P | P | ? | P | P | — | S | ? | — |
| Local Service Research USA / **36** / **30–60 USD/h** | P | S | ? | P | — | ? | S | P | P | P |

### Raisons exactes et obstacles non techniques

**Etsy (61).** 30–40 fiches, 10–15 boutiques ; variantes, matériaux/personnalisation, remises, suppléments, livraison US, délais, avis et demande. Manquent export structuré, collecte de plusieurs pages et contrôle des contextes tarifaires. Prix et livraison peuvent dépendre de choix dynamiques non accessibles au GET ; des comparaisons de matériaux erronées ou ventes boutique assimilées à ventes produit compromettent la qualité. 20–50 propositions : concurrence réelle. Expertise matériaux signalée comme besoin de jugement, **pas certification explicitement exigée**. Périmètre et prix ne sont pas mauvais isolément : **100 USD insuffisants pour nos 4–7 h humaines estimées**, d'où le classement budget. Disponibilité/Connects non confirmés, jamais « ouverte » par défaut.

**Quick DTC (56).** Trois concurrents, tableau/document et synthèse : proche de l'offre, mais page **fermée** et **5 USD**. Quelques exports/contrôles pourraient rendre le livrable plus facile ; aucune amélioration ne rouvre la mission ni ne change son budget. Informations client/concurrence indisponibles sur la page fermée. Pas de réduction de QA pour accepter 5 USD.

**White-label (47).** Premier jalon seulement **150 USD**, pour dix produits avec demande/économie ; suite avec devis fournisseurs et coordination d'échantillons. Expertise sourcing/unit economics et **preuve d'un produit réellement devenu rentable** requises. Notre absence de cet historique est une exclusion ferme (10), qu'aucun outil ni sample ne peut remplacer. Le budget total affiché n'est pas acquis. Plusieurs données/devis nécessitent du contact (4/10). Aucune estimation de marge crédible sur un travail que nous ne savons pas fournir. Les 5–10 propositions sont un facteur secondaire, pas le motif principal.

**Digital PR (37).** Il faut un article comparant cinq logiciels **publié sur un média**, outreach, critères d'audience/autorité et samples publiés. La rédaction/réécriture générative est **explicitement interdite par ce client** (10). Les métriques et placement ajoutent des dépendances (4), mais outil payant indispensable à acheter non démontré ; ne pas prétendre que le prix seul bloque. 250 USD est indicatif, les coûts éditeur restent inconnus. L'amélioration de nos tableaux ne change aucune de ces exclusions.

**Data Entry (40).** Volume et schema non bornés, tableurs demandés ; 50+ candidatures et 5 USD. Export et extraction peuvent aider des futurs briefs similaires **à budget et volume acceptables**, pas rendre ce brief rentable en supposant un petit lot accepté. Risque de travail récurrent non rémunéré à sa juste portée. Pas d'accès privé obligatoire établi dans le brief lu.

**Local Service (36).** Appels obligatoires et localisation US, trois embauches mission visibles. Ce sont des exclusions fermes. Le faible nombre de candidatures n'est pas une forte concurrence. L'automatisation d'appels n'est pas une amélioration proposée : elle violerait le périmètre public sans contact. Tarif horaire élevé ≠ montant garanti ; volume/marge inconnus. Ne pas inventer une localisation ou une expérience orale.

## 3. Classement des capacités à envisager

Temps = heures de développement/validation par un opérateur connaissant le code, **estimations**, pas devis ni travail déjà effectué. Risque = erreur/complexité introduite avant recette. Les heures se chevauchent : ne pas les sommer comme projets indépendants. « Missions supplémentaires » désigne types potentiels, pas offres disponibles ou nombre prédit.

| Rang / capability | Impact commercial | Difficulté | Risque | Temps dev estimé | Missions supplémentaires potentielles |
|---|---|---|---|---|---|
| **1. Schema de preuves + extraction multi-page bornée** | Élevé : prix/features réutilisables, moins de ressaisie | Moyenne | Moyen : associations tarifaires erronées | **6–10 h** | Comparatifs 5–10 concurrents, 10–20 produits publics ; Etsy seulement pour données réellement accessibles |
| **2. Export CSV déterministe, puis XLSX confiné** | Élevé : format fréquent et suppression de la conversion manuelle | Faible/moyenne | Faible après tests ; formules et chemins à contrôler | **2–4 h CSV ; +3–5 h XLSX** | Research matrices, pricing comparisons, vendor/product tables ; Data Entry à scope acceptable |
| **3. Contrôle des citations/contextes/contradictions + rapport depuis le schema** | Élevé : QA ciblée et livrable plus rapide | Moyenne | Moyen : faux sentiment de vérification | **6–10 h**, rapport simple inclus | Comparatifs multi-source fiables et mises à jour sourcées ; mêmes familles que 1 |
| 4. Orchestration de lots 5–10 acteurs avec cache/reprise | Moyen/élevé, après 1 et 3 | Moyenne | Moyen : budget réseau/contexte | **3–5 h** partiellement incluses en 1 | Lots plus grands publics ; ne garantit pas 30–40 fiches dynamiques |
| 5. Recherche multi-source et déduplication de résultats | Moyen : moins de sélection humaine | Moyenne | Moyen : mauvaises sources/duplicats | **3–6 h** | Vendor/business research avec découverte bornée ; validation opérateur encore requise |
| 6. Meilleure gestion des grosses pages **sans relever le plafond réseau** | Moyen et dépendant du site | Moyenne | Moyen : capture partielle sans contexte | **3–6 h** | Pages offrant document officiel plus léger ou section complète dans un préfixe valide |
| 7. Scoring commercial et synthèse assistés | Moyen pour tri, faible pour accès aux données | Faible/moyenne | Moyen : score gonflé ou conclusions sans faits | **2–4 h** | Briefs comparables et conclusion standard ; aucun avis/contrat garanti |
| 8. Générateur de PDF final exposé à Aurum | Moyen : présentation rapide | Moyenne | Moyen : rendu/liaisons erronés | **3–5 h** après schema/rapport | Rapports documentaires ; baisse de mise en forme, pas de coût de collecte |

**Trois améliorations sélectionnées : 1, 2 et 3**, avec une première tranche **1 + CSV de 2** ; reporter XLSX et le rapport PDF si les premiers tests échouent. Une sortie JSON/Markdown/CSV validée a priorité sur une belle présentation. Intégrer le contrôle de preuve dès 1, puis étendre la détection de contradictions en 3 : ne pas attendre la dernière tranche pour interdire les valeurs inventées.

### Précision sur les grosses pages

Le traitement local en flux peut réduire mémoire et bruit **mais ne rend pas téléchargeable une page qui dépasse 512 KiB**. Ne pas relever simplement le plafond ni promettre de récupérer Calendly/Cal.com. Solutions à tester séparément : source officielle publique plus légère, ou extraction partielle plafonnée **explicitement marquée INCOMPLETE**, jamais assimilée à un document entier. Rejeter les faits si leur contexte de plan est hors de la portion reçue. Ni Range répété pour reconstituer une grande page, ni retry infini, proxy, cookies, rendu connecté ou contournement anti-bot. Aucun gain de couverture affirmé avant test.

## 4. Recette proposée pour chaque sélection

### 1 — Extraction structurée et lots bornés

**Pourquoi :** la saisie et l'association correcte offre/prix/plan sont communes à plusieurs types de recherche. Un prompt plus long ne remplace pas une structure de preuves. À ajouter via un outil dédié confiné, Ollama local seulement ; pas de shell offert au modèle.

Chaque fait porte entreprise/produit/plan, champ, valeur ou UNKNOWN, unité, devise explicite, période/facturation, variante, pays de livraison si pertinent, URL finale, date, court extrait exact, ID/hash de source et statut COMPLETE/INCOMPLETE/BLOCKED. Interprétations séparées. Une source récupérée sur deux pages ne devient pas deux confirmations indépendantes. Budget/session, redirections et rate-limit comptés ; cache de session réutilisable sans nouvelle requête, reprise après erreur, pas de collecte agressive. Stocker plusieurs petits fichiers source pour respecter **128 KiB lecture/256 KiB écriture**, et plafonner nombre de pages/champs.

**Test technique futur :** dix entreprises publiques non sensibles, deux pages au plus chacune, selection opérateur ; commencer à cinq, puis dix seulement après succès. Fixtures tarifaires avec `$` sans devise, annuel/mensuel, essai gratuit, variante et page absente. Jeux de référence annotés avant extraction ; aucun fait critique erroné accepté, 100 % des faits livrables associés à preuve existante. Mesurer couverture réelle, inconnus corrects, temps machine et temps humain ; les fixtures de transport ne prouvent pas l'accès à Etsy. Échec contrôlé pour dépassement de budget/taille, page bloquée ou injection d'instructions dans HTML.

**Mission pouvant bénéficier :** Etsy partiellement ; prochains lots de SaaS/vendors sur pages publiques. Gain humain visé **30–60 min** sur un lot comparable de 30–40 fiches, si la collecte est accessible ; **0 min promis** sur variantes/paniers bloqués. Score Etsy indicatif après cette seule amélioration testée : **65 = 20+15+7+9+3+7+4**, toujours PASS. Aucun autre PASS ferme du jour levé.

### 2 — CSV fiable puis XLSX déterministe

**Pourquoi :** un schema propre peut servir à la fois à une matrice, au QA et à un rapport. Export par code fixe depuis JSON validé, **pas un classeur libre généré par le modèle**. CSV d'abord, sans dépendance supplémentaire coûteuse ; XLSX seulement avec dépendance locale disponible/validée, licence et intégration contrôlées. Un outil d'export binaire dédié doit conserver les garde-fous du workspace plutôt que donner accès libre aux écritures.

**Test futur :** 40 lignes avec accents, virgules, guillemets, retours ligne, UNKNOWN, prix et URL. Round-trip CSV sans perte de cellule, puis XLSX rouvert et valeurs identiques ; feuilles Comparison/Sources/Unknowns, en-têtes figés, filtres et liens exacts si XLSX. Un texte commençant par `=`, `+`, `-`, `@`, tabulation/retour doit rester une cellule texte sûre, pas une formule (sans altérer les nombres légitimes). Aucun macro, formule issue du modèle ou ressource externe active. Traversée de chemins, lien symbolique, écrasement non validé et limites de taille : refus. Rendu/tableau relu par opérateur.

**Gain visé : 20–45 min** de mise en forme/conversion par gros lot, en supplément seulement s'il n'est pas déjà économisé par 1. Aucun gain sur vérification des prix. Etsy après **1+CSV/XLSX validé** : **68 = 21+15+9+9+3+7+4**, encore PASS. Futurs Data Entry mieux bornés bénéficient techniquement, mais le brief à 5 USD reste PASS ; Quick DTC reste fermé et sous plancher.

### 3 — Contrôle de preuves et contradictions, synthèse/rapport

**Pourquoi :** cibler les alertes réduit la revue de forme et la recherche de citations, mais **ne supprime pas le jugement humain**. Vérification déterministe d'abord : URL réellement récupérée, date/statut, extrait présent dans source, plan/unité attachés, absence de conversions injustifiées, provenance conservée. Présence de texte ≠ preuve que ce texte implique la conclusion. Contrôle sémantique local peut signaler, jamais certifier seul.

Comparer seulement même entreprise/produit/plan/variante/région/période ; séparer remises, unités, essais et gratuits. Contradiction => alerte/UNKNOWN ou alternatives contextualisées, **pas vote majoritaire automatique**. Générer tableau et Markdown/HTML uniquement depuis les faits retenus ; implications étiquetées, citations héritées ; aucun nouveau chiffre dans la synthèse. PDF en deuxième étape avec renderer déterministe et inspection visuelle obligatoire, pas nécessaire au pilote.

**Test futur :** corpus avec erreurs connues : prix au mauvais plan, dollars sans code, shipping pour autre région, ventes boutique/produit, trois écarts tarifaires légitimes et trois contradictions réelles, citation absente, source bloquée. Toutes les erreurs critiques injectées doivent bloquer la livraison ; mesurer les faux positifs sur données correctes. Une affirmation correcte dont l'extrait ne couvre pas le contexte doit rester à vérifier. Comparer tous les champs critiques au gold set ; revue humaine indépendante chronométrée et vérification visuelle du rapport.

**Gain additionnel visé : 30–60 min** sur QA/corrections/rapport d'un lot, sans additionner deux fois le temps déjà gagné. Score central après les trois améliorations **si testées** : **69 = 21+16+9+9+3+7+4**, donc ne pas présumer une candidature. Scénario haut **72 = 22+17+10+9+3+7+4**, uniquement après la recette complète décrite ci-dessous. Concurrence, clarté, réception et répétition maintenues ; aucune hausse d'avis parce qu'un outil existe.

## 5. Quand le brief Etsy pourrait réellement changer de catégorie

| État | Score conditionnel | Verdict |
|---|---:|---|
| Aujourd'hui | **61** | PASS maintenu |
| 1 testé seul | **65** | PASS |
| 1 + 2 testés | **68** | PASS |
| 1 + 2 + 3, hypothèse centrale | **69** | PASS, pas capacité supposée rentable |
| Recette complète 30–40 fiches, qualité et économie établies | **70–72**, scénario conditionnel | Potentiellement admissible techniquement ; ouverture/Connects/brief à revalider, aucune candidature maintenant |

Pour envisager ≥70 : tester le **périmètre complet 30–40 fiches/10–15 shops**, pas seulement cinq concurrents faciles. Variantes et livraison US soit réellement récupérables et correctement contextualisées, soit inconnus **acceptés explicitement par le client** ; pas décider à sa place que ces champs exigés sont facultatifs. Pas de bases privées, compte connecté ou outil payant. Confirmer capacité à distinguer matériaux et indicateurs de demande sans surpromettre. **100 % des champs critiques livrés revus humainement, zéro erreur critique**, toutes les alertes résolues ou signalées ; ouverture réelle/absence d'embauche, IA autorisée, délai et Connects connus. Les grands lots doivent respecter les budgets réseau : 30–40 fiches nécessiteraient plusieurs sessions/délais autorisés, pas une levée de limite.

Temps humain cible complet **2–3,5 h**, contre estimation actuelle 4–7 h ; économie plausible **1,5–3 h**, sans total mécanique des sous-gains. Coût et gain réels **à mesurer**, et qualité prioritaire. Pour relever le budget/temps au scénario 70–72, viser **≤2,5 h** humaines sur le lot complet, préparation de candidature et corrections explicitement provisionnées ; ne pas substituer un microbenchmark de 36 secondes à ce chronométrage.

À 100 USD, commission hypothétique 15 %, provision 0,50 USD : contribution avant acquisition = **85 − 0,50 − 20×H**. H=2/2,5/3,5 h => **44,50 / 34,50 / 14,50 USD**, avant temps de proposition non inclus, retrait/FX/impôts et coûts omis. Acquisition = **0,15×Connects×nombre de candidatures**, plus frais réels ; Connects inconnus aujourd'hui. Trois candidatures supposées de 16 Connects = 7,20 USD avant taxes/FX : exemple, pas achat prévu. Pas de profit net affirmé ni d'imputation des 100 USD à une prestation réduite non acceptée.

**Missions du jour potentiellement débloquées : 0 aujourd'hui ; au plus 1 (Etsy) conditionnellement après tests.** White-label, PR, appels et budgets 5 USD restent exclus. Aucune technologie proposée ne transforme leur scope en notre service. Demande supplémentaire potentielle sur prochains lots publics/structurés : **non quantifiable** avec six briefs.

## 6. Périmètre recommandé du prochain développement

**BUILD CAPABILITY**, en première tranche limitée : **schema de preuves, extraction bornée et CSV fiable**, puis test de cinq acteurs/10 pages avant extension. Budget dev cible initial **8–14 h** ; compute externe/dépense discrétionnaire **0 EUR**, Ollama local seulement. Extension 2/XLSX + 3 seulement après gain humain et QA mesurés ; enveloppe totale des trois sélections **17–29 h** indicative, hors aléas, pas « presque gratuite » en temps. À 20 USD/h analytique : investissement économique **340–580 USD** si toute l'enveloppe est consommée, non une dépense autorisée. Amortissement commercial encore inconnu : ne pas financer un grand chantier pour une seule annonce à 100 USD.

Critère d'arrêt du pilote : transport incapable d'obtenir les champs essentiels, erreurs critiques après une itération de correction, ou absence de réduction humaine mesurable à qualité identique. Revue avant toute extension ; aucun achat pour compenser un échec. Le premier pilote valide collecte/qualité/export, **pas automatiquement le score Etsy**. Ne déclarer « fonctionnel » qu'après tests reproductibles, résultats sauvegardés et revue réelle.

Hors scope : élargissement aveugle des limites web, scraping de marketplaces à grande échelle, browser/login, outreach/téléphone, outils payants, historique client artificiel, modification Fiverr/wallet. Recherche Upwork arrêtée aujourd'hui. Ce document choisit le prochain investissement technique ; **il ne lance ni développement ni candidature**.
