# Exemple local réellement calculé — nettoyage de CSV

Toutes les données ci-dessous sont synthétiques. Aucun fichier client ni donnée personnelle n’a été utilisé. Exemple calculé par Codex pendant la revue, pas par un shell donné à Aurum.

## Entrée : cinq lignes

```csv
sku,produit,quantite
 a-001 ,Cahier A5,10 
A-001,Cahier A5,10
B-002,Stylo bleu,3
c-003,Bloc notes,N/A
d-004 ,Classeur,7
```

## Règles

Retirer les espaces de bord, mettre le SKU en majuscules, retirer uniquement les doublons exacts après normalisation et mettre les quantités non numériques en quarantaine.

## Sortie propre : trois lignes

```csv
sku,produit,quantite
A-001,Cahier A5,10
B-002,Stylo bleu,3
D-004,Classeur,7
```

## Rapport de contrôle

- Ligne 2 : doublon exact de la ligne 1 après normalisation ; retirée.
- Ligne 4 : quantité N/A non numérique ; mise en quarantaine, aucune valeur inventée.
- Conservation : 5 entrées = 3 lignes propres + 1 doublon + 1 ligne en quarantaine.
- Total des quantités conservées : 20. La ligne en quarantaine est exclue de ce total.
- Les trois lignes propres ont des SKU distincts et des quantités entières positives.

Ce livrable démontre la transformation locale sur un petit exemple ; il ne démontre ni demande, ni qualité généralisée, ni paiement.
