export interface MissionTemplate {
  id: string;
  label: string;
  description: string;
  context: string;
}

export const MISSION_TEMPLATES: MissionTemplate[] = [
  {
    id: "cdc-saas",
    label: "Cahier des charges SaaS",
    description: "Spécification produit web B2B ou B2C.",
    context: `## Objectif
Définir un cahier des charges pour une application SaaS.

## À préciser
- Problème utilisateur et personas
- Fonctionnalités MVP vs roadmap
- Contraintes techniques (stack, hébergement, RGPD)
- Modèle économique et métriques de succès
- Risques et dépendances`,
  },
  {
    id: "audit-tech",
    label: "Audit technique",
    description: "Revue architecture, dette et recommandations.",
    context: `## Objectif
Produire un audit technique structuré du projet décrit ci-dessous.

## Angles attendus
- Architecture et modularité
- Qualité du code et tests
- Sécurité et secrets
- Performance et scalabilité
- Dette technique priorisée avec plan d'action`,
  },
  {
    id: "spec-api",
    label: "Spécification API",
    description: "Endpoints, contrats et bonnes pratiques REST.",
    context: `## Objectif
Rédiger une spécification API exploitable par une équipe backend et frontend.

## Contenu attendu
- Ressources et endpoints principaux
- Schémas de requête / réponse
- Authentification et erreurs
- Versioning et limites de débit
- Exemples d'usage`,
  },
];
