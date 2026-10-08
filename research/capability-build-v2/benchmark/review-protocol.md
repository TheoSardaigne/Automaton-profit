# Revue humaine indépendante — pricing v2

**Statut initial : PENDING_OWNER_TIMED_REVIEW.** Aucun temps humain ni résultat
de qualité n'est présumé. Ne pas assimiler une revue Codex à un contrôle humain.

1. Ouvrir `human-review.html` localement dans un navigateur. C'est un outil de revue
   hors ligne : aucun login, appel réseau automatique, achat ou envoi. Les liens
   de sources ne s'ouvrent que sur clic humain.
2. Cliquer « Démarrer le chrono » avant la première vérification. Le temps de lecture,
   consultation des sources, comparaison et décision fait partie de la revue.
3. Pour chaque ligne acceptée par le code, vérifier ensemble **source, citation exacte,
   plan/option et valeur normalisée**. CORRECT seulement si toutes ces conditions sont
   satisfaites. INCORRECT si une valeur ou association est fausse ; INCERTAIN si la
   source dynamique ou le contexte ne permet pas de conclure. Ne pas corriger un champ
   et le compter ensuite comme un succès automatique : conserver l'erreur initiale.
4. Vérifier particulièrement les prix payants YCBM rendus à zéro en HTML statique,
   la distinction Free/Free Trial, symbole $/USD et prix mensuel/facturation annuelle.
5. Terminer, exporter `pricing-v2-human-review.json` et transmettre le fichier dans
   cette conversation. L'outil n'envoie rien. Les résultats sont une déclaration
   propriétaire chronométrée, pas une attestation antifraude ou une transaction.

Alternative : compléter `human-review-template.json` et relever un vrai chrono,
avec heures de début/fin. Valeur non mesurée = UNKNOWN ; ne pas inscrire un temps cible
de 10–15 minutes comme un résultat. En cas d'interruption, conserver le temps total
et documenter la pause ; ne pas reconstruire un temps actif fictif.

Mesures : nombre accepté, revu, correct, incorrect, incertain, non revu ; temps réel ;
correct / total accepté (les non revus ne comptent pas corrects). Objectif ≥80 % et
zéro acceptation sans preuve exacte, avec nombres absolus. Un petit échantillon ne
valide pas tous les plans ni d'autres sites. Toute erreur critique demande correction
avant livraison client. Ne pas toucher au gig, accepter de commande ou candidater.
