# Revue propriétaire — v3

Ouvrir human-review.html localement, démarrer le chrono, vérifier les 12 lignes
(4 plans × 3 sources), chacune avec deux offres séparées.

- Mensuel : engagement monthly et taux affiché par mois.
- Annuel : engagement annual et taux affiché par mois ; ce n'est pas le total annuel.
- Vérifier symbole/code de devise, montant, plan, source actuelle et langue URL.
- Sur les pages pricing, consulter manuellement les deux options ; noter la devise,
  l'option et le montant réellement affichés en cas de divergence. Aucun clic automatique.
- Sur la comparaison, tenir compte de la référence April 2026 et des colonnes Monthly /
  Annual (per month). Comparer à une source actuelle ; ne pas présumer sa fraîcheur.
- CORRECT valide le tuple entier, pas seulement une citation présente. Sinon INCORRECT
  ou UNCERTAIN. Les UNKNOWN et conflits non résolus ne sont pas livrables.
- Terminer/exporter le JSON et transmettre les valeurs observées si elles diffèrent.
- Indiquer si cette UI est plus simple que v2 : comparaison déclarée par le propriétaire,
  distincte d'une différence de chrono sur des tâches/échantillons différents.

Revue plus courte et absence d'erreur ne sont pas préremplies. Le benchmark ne devient
réussi qu'après revue complète, absence de montant erroné, séparation mensuel/annuel,
blocage des conflits et simplicité confirmée. Aucun recalcul Upwork avant cela.

Le script d'intake vérifie les identités exactes du relevé, les compteurs et le chrono.
Il écrit reviewed-results.json et reviewed-metrics.json sans effacer les captures
originales ; la validation humaine ne résout pas un conflit inexpliqué automatiquement.
