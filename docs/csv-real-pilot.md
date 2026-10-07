# Premier essai réel : nettoyage de petits exports CSV

> Archive de la piste CSV préparée le 6 octobre 2026, avant création des profils.
> Le test actif concerne la recherche concurrentielle ; voir [le journal Fiverr](research/fiverr-test-v1/live-test.md).
> Ce brouillon historique ne constitue pas une nouvelle offre publiée.

État au 6 octobre 2026 : dossier préparé, aucun compte créé, aucune offre publiée,
aucune candidature envoyée, aucune dépense engagée et aucun paiement reçu.
Le propriétaire a indiqué être disposé à financer un petit essai et ne possède
ni compte Upwork ni compte Fiverr. Le plafond de dépense reste à préciser.
Les protections financières d'Aurum et le routage Ollama restent inchangés.

## Ce que les sources permettent réellement de conclure

Une [annonce client Upwork](https://www.upwork.com/freelance-jobs/apply/Excel-Data-Cleaning-and-Automation_~022105597905396259311/)
demande du dédoublonnage, de la normalisation et du nettoyage Excel, avec un
budget horaire annoncé de 5–20 USD. Elle porte sur plus de 100 000 lignes et
affiche plus de 50 candidatures. Elle est exclue du pilote : volume et concurrence
trop élevés. C'est une demande publiée, pas une commande obtenue par Aurum.
La page a été consultée via l'outil web de Codex ; le fetch local d'Aurum a
renvoyé HTTP 403. Sa disponibilité pour candidater reste à vérifier dans un compte.

Une [offre concurrente Upwork](https://www.upwork.com/services/product/development-it-automated-data-entry-clean-raw-data-create-reports-1980416903749725322)
affiche 25 USD pour une formule de nettoyage jusqu'à 1 000 lignes. Il s'agit
d'un prix proposé, pas d'une transaction vérifiée. Elle est également lisible
via Codex mais renvoie HTTP 403 au fetch local. Notre limite initiale de 100
lignes est plus étroite ; aucun avantage concurrentiel ni taux de conversion
n'est démontré. Le prix de test ci-dessous pourra être révisé après retours.

Les outils sécurisés d'Aurum ont lu cinq pages officielles avec succès :

| Point vérifié | Source primaire | Conséquence pour le test |
|---|---|---|
| Commission Upwork de 0 à 15 % par contrat, taux visible avant engagement | [Frais freelance](https://support.upwork.com/hc/en-us/articles/211062538-Learn-about-the-Freelancer-Service-Fee) | Calculer avec le taux réel, conserver 15 % pour le scénario prudent |
| Connects à 0,15 USD l'unité ; moyen de facturation vérifié requis pour achat | [Connects](https://support.upwork.com/hc/en-us/articles/211062898-Understanding-and-using-Connects) | Nombre nécessaire, lot d'achat, taxes et conversion à vérifier avant de payer |
| Fiverr reverse 80 % du montant de la commande au freelance | [Revenus Fiverr](https://help.fiverr.com/hc/en-us/articles/9234443621137-Your-earnings-page) | 25 USD de commande donnent 20 USD avant autres frais et fiscalité |
| Une offre Fiverr nécessite un profil et l'onboarding vendeur, avec vérifications demandées par la plateforme | [Créer une offre](https://help.fiverr.com/hc/en-us/articles/360010451397-Creating-a-Gig) | Inscription et identité réelles du propriétaire avant publication |
| Fiverr permet l'IA responsable ; le freelance répond de la qualité et doit respecter les préférences du client | [Usage de l'IA](https://help.fiverr.com/hc/en-us/articles/37554976380177-Using-AI-on-Fiverr-Guidelines-for-freelancers-and-clients) | Revue humaine et transparence sur le travail assisté |

Les [règles de paiement Upwork](https://support.upwork.com/hc/en-us/articles/211063718-How-payments-for-milestones-and-fixed-price-contracts-work)
prévoient un jalon financé, une revue client pouvant durer 14 jours, puis une
période de sécurité de cinq jours avant disponibilité du paiement. Sur Fiverr,
l'[aide aux freelances](https://help.fiverr.com/hc/en-us/articles/34069565843985-How-Fiverr-works-for-freelancers)
annonce généralement 14 jours de compensation avant retrait. Ces deux pages
ont été consultées par Codex. Une commande acceptée n'est donc pas un encaissement
bancaire immédiat ; les délais de retrait et les exceptions restent à vérifier.

## Offre pilote à relire avant publication

**Titre proposé :** I will clean a small inventory CSV and provide a quality report

**Prix de test :** 25 USD, hypothèse commerciale. Un fichier CSV de stock non
sensible, jusqu'à 100 lignes et 10 colonnes, au plus 100 Ko. Aucun traitement
de données personnelles, bancaires ou médicales pour ce premier essai.

**Résultat proposé :** copie nettoyée du fichier, journal des transformations,
doublons exacts séparés et lignes ambiguës mises à part. Les règles de
normalisation sont convenues au préalable. Les SKU, zéros initiaux et colonnes
protégées ne sont jamais convertis ou modifiés sans accord explicite.

**Périmètre :** espaces de bord, casse sur colonnes désignées, doublons exacts
et contrôles de validité simples. Ni enrichissement, scraping, intégration,
macro, formule complexe, conversion XLSX ni interprétation libre de dates.
Pas de valeur inventée. Une révision dans les règles convenues. Objectif de
livraison : 48 heures après réception des données et des règles complètes,
à confirmer selon la disponibilité réelle du propriétaire.

**Description en anglais, prête à adapter :**

> I will clean one small inventory CSV using rules we agree before starting.
> You receive a clean copy, a short change report, exact duplicates and a separate
> list of rows needing your decision. Your original file stays unchanged.
> The pilot covers up to 100 rows and 10 columns, with one revision to the agreed
> rules. I use local automation and AI assistance where appropriate and review
> the output. Please provide only authorized, non-sensitive inventory data.

Ce texte est un brouillon, pas une offre déjà publiée ni une promesse de
traitement intégralement autonome. L'exemple disponible a été calculé et revu
par Codex, pas exécuté par un shell remis à Aurum.

## Exemple et contrôle qualité avant première commande

L'[exemple synthétique](research/first-payment/2026-10-06T18-53-12-193Z/sample.md)
montre cinq lignes en entrée, trois conservées, un doublon retiré et une ligne
en quarantaine ; total des quantités conservées : 20. Il prouve seulement
la transformation sur cet exemple, pas la robustesse de tous les CSV.

Avant d'accepter une commande : contrôler un échantillon anonymisé, déterminer
séparateur/encodage, vérifier les champs entre guillemets et les zéros initiaux,
confirmer les colonnes protégées et les critères de doublon. Arrêter et demander
une décision si le fichier ne correspond pas au périmètre. La qualité du fichier
réel sera revue ligne par ligne pour le premier pilote.

## Économie du premier test — scénarios, pas résultats

Tous les calculs ci-dessous sont en USD. Aucun taux EUR/USD n'est présumé.
Les taxes, frais de retrait, conversions, remboursements et temps d'acquisition
ne sont pas inclus dans ces premiers sous-totaux ; ils doivent être enregistrés
avant de déclarer un profit net.

| Scénario : une commande à 25 USD | Après commission | Acquisition externe hypothétique | Contribution après ces deux postes |
|---|---:|---:|---:|
| Fiverr, découverte organique | 20,00 | 0,00 | 20,00 |
| Upwork, commission prudente 15 %, une candidature à 20 Connects | 21,25 | 3,00 | 18,25 |
| Upwork, commission prudente 15 %, trois candidatures à 20 Connects chacune et une vente | 21,25 | 9,00 | 12,25 |
| Upwork, mêmes trois candidatures et aucune vente | 0,00 | 9,00 | -9,00 |

Les 20 Connects par candidature sont une hypothèse, pas le coût d'une annonce
vérifiée. Le lot minimal achetable et le montant total du checkout peuvent
dépasser le coût des Connects effectivement utilisés. Le plafond portera sur
la sortie d'argent réelle, pas seulement la consommation théorique.

Hypothèse illustrative : 30 minutes de revue à 20 USD/heure représentent
10 USD de temps humain. La contribution Upwork à trois candidatures tomberait
alors à 2,25 USD avant les autres coûts et le temps de prospection. Aucun gain
n'est attendu avec certitude : probabilité de vente et durée réelle inconnues.

## Séquence d'essai recommandée

1. Créer un compte vendeur sous l'identité réelle du propriétaire et terminer
   les étapes d'onboarding dans la plateforme. Aucun identifiant ne doit être
   stocké dans le dépôt ni dans le workspace d'Aurum.
2. Commencer par une seule offre et un exemple honnête. Mon choix provisoire
   est Fiverr pour éviter de payer des candidatures avant de disposer d'un
   profil. Cela ne garantit aucune visibilité ni vente. Ne prendre aucun
   abonnement, publicité, domaine ou service supplémentaire pour cette phase.
3. Après publication effective, observer pendant sept jours au maximum,
   avec un plafond proposé de deux heures humaines de préparation/suivi.
   Consigner visites, demandes qualifiées et commandes séparément. Si aucune
   demande qualifiée n'arrive, revoir le positionnement avant de dépenser.
4. Un essai Upwork payant ne devient pertinent que si trois annonces au plus
   correspondent précisément au service, que le coût de chaque candidature
   et du checkout est connu et que le budget du propriétaire est fixé.
   Propositions individualisées, aucun boost, abonnement ou envoi massif.
   Aucun message/candidature n'est autorisé ou envoyé par ce dossier.
5. Plafond proposé pour cette première acquisition : 10 EUR TTC, à confirmer.
   Le choix du canal et tout achat devront correspondre à une action précise
   et à un montant connu. Aucune réactivation des moyens de paiement d'Aurum,
   aucun financement du wallet et aucun compute payant n'est nécessaire.

## Vérifier paiement et profit sans les confondre

Conserver une référence réelle de commande, le montant payé par un client
externe, les frais de plateforme, les remboursements et les frais d'acquisition.
Distinguer commande, paiement libéré, montant disponible et retrait reçu.
Un paiement sandbox, une commande du propriétaire ou une commande financée
pour créer une fausse preuve ne valident pas la demande externe.

Le premier encaissement vérifié devra être rapproché du relevé du prestataire
et, pour déclarer les fonds reçus sur le compte de règlement, de la preuve du
retrait réel. Profit financier = encaissements externes vérifiés moins tous
les coûts externes réels ; présenter le temps machine/humain séparément.

## Décisions encore nécessaires

- Le plafond exact accepté par le propriétaire.
- Le compte réellement créé et validé, et le canal qu'il choisit.
- La validation du texte, du périmètre et de la disponibilité de livraison.
- Avant acquisition payante : des annonces adaptées et le coût final au checkout.

La recherche soutient l'existence d'un marché de nettoyage de données ; elle
ne démontre pas encore qu'un client achètera notre offre. Le prochain jalon
est une offre réelle puis une demande qualifiée, pas un achat de compute.
