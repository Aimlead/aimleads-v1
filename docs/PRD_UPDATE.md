## 1. Product Experience Overhaul (Priorité P0)

L'expérience produit doit subir une refonte complète pour garantir un standard de qualité "SaaS-grade". Cette refonte se concentre sur la cohérence, la lisibilité et la fiabilité des interactions sur l'ensemble de la plateforme.

**Refonte des Pages Centrales :**
Les interfaces clés de l'application nécessitent une révision approfondie pour optimiser le flux de travail de l'utilisateur :
- **Dashboard :** Clarifier les indicateurs clés de performance et l'état global du pipeline.
- **Leads / Pipeline :** Améliorer la lisibilité des listes et la gestion des statuts de prospection.
- **Lead Detail :** Restructurer la vue détaillée pour mettre en évidence la logique de scoring (voir section 3).
- **Outreach :** Rendre la gestion des séquences et des modèles d'approche plus intuitive.
- **Analytics :** Assurer que les graphiques et les données sont facilement interprétables.

**Audit Global UI/UX :**
Une passe de qualité transversale doit être appliquée pour unifier l'identité visuelle. Cela inclut l'harmonisation de la hiérarchie de l'information, de l'espacement et de la lisibilité. Une attention particulière sera portée aux états d'interface : chaque action doit posséder des états clairs de chargement (loading), de vide (empty), de succès et d'erreur. La hiérarchie des appels à l'action (CTA) doit guider l'utilisateur naturellement vers les tâches prioritaires, tout en maintenant une cohérence d'interaction stricte à travers toutes les vues.

**Audit de Fiabilité des Interactions :**
Chaque bouton et action importante sur les pages clés doit être rigoureusement testé. Il est impératif d'éliminer tout bouton inactif ("dead button") ou toute action dont l'issue n'est pas claire. Le système doit fournir un retour utilisateur (feedback) immédiat et fiable, en gérant correctement les états désactivés et les messages de confirmation ou d'erreur.

**Audit de Traduction :**
Une révision complète des traductions (Français et Anglais) est requise pour s'assurer de la cohérence terminologique et de la qualité du contenu dans toute l'interface.

---

## 2. Lead Import, List Management & CRM (Haute Priorité)

Les flux d'acquisition et de synchronisation des données sont critiques pour l'adoption du produit et doivent être traités comme des fonctionnalités centrales.

**Flux d'Importation de Leads :**
L'importation de fichiers CSV ou de listes doit être d'une fiabilité absolue. L'interface de mappage des colonnes doit être explicite, guidant l'utilisateur sans ambiguïté. Le processus doit inclure une validation en amont, une gestion claire des erreurs de formatage, et fournir à l'utilisateur un sentiment de confiance tout au long de l'opération.

**Gestion des Listes :**
Une page dédiée à la vue d'ensemble et à la gestion des listes importées est nécessaire. Elle doit clarifier la relation entre une liste brute importée et les leads analysés. L'objectif est de permettre aux équipes de passer proprement d'une logique de "liste de contacts" à une logique de "pipeline priorisé".

**Intégrations CRM :**
Les intégrations existantes (HubSpot, Salesforce) doivent offrir une utilisabilité irréprochable. Cela implique une interface de mappage de champs limpide, une visibilité en temps réel sur le statut de synchronisation, et des retours d'erreur explicites en cas d'échec. La fiabilité opérationnelle de ces synchronisations bidirectionnelles est un prérequis majeur.

---

## 3. Clarification du Scoring et Lead Detail

L'expérience de consultation des leads (Leads / Lead Detail) ne doit pas être réinventée de zéro, mais doit s'aligner sur les meilleures pratiques de la version HTML de référence existante, en respectant son UX et sa hiérarchie de l'information.

**Transparence et Actionnabilité du Score :**
L'objectif n'est pas seulement de calculer un score, mais de le rendre compréhensible, digne de confiance et actionnable dans l'interface. L'explication du score ICP doit être explicite : l'utilisateur doit comprendre l'évaluation critère par critère, et non se contenter d'un chiffre global.

**Présentation Requise du Scoring :**
La vue détaillée d'un prospect doit impérativement afficher :
- Le **Score Final** (priorisation globale).
- Le **Score ICP** (adéquation au profil idéal).
- Le **Score d'Intention / Signal** (lorsque l'IA détecte des signaux pertinents).
- Une **ventilation détaillée du score ICP** par critère.
- Une **explication claire** justifiant pourquoi le lead est priorisé ou écarté.

**Dimensions de l'Explication ICP :**
La ventilation détaillée doit systématiquement couvrir les dimensions suivantes :
- L'industrie (Industry)
- Le rôle du contact (Role)
- Le type de client (Client type)
- La structure de l'entreprise (Company structure)
- La géographie (Geography)

---

## 4. Mise à Jour de la Priorisation et Contraintes (Scope Révisé)

La feuille de route est ajustée pour respecter les contraintes commerciales et techniques actuelles.

| Priorité | Domaine | Fonctionnalité | Justification / Contrainte |
| :--- | :--- | :--- | :--- |
| **P0** | **Expérience Produit** | Product Experience Overhaul | Audit UI/UX global, fiabilité des interactions, et refonte des pages centrales (Dashboard, Pipeline, Lead Detail). |
| **P0** | **Stabilité Core** | Consolidation Tenancy & Identité | Finaliser le modèle basé sur `workspace_members`. (Maintenu du PRD initial). |
| **P0** | **Acquisition Data** | Import & Gestion des Listes | Fiabiliser l'import CSV, le mappage, et la transition liste → pipeline. |
| **P1** | **Authentification** | Single Sign-On (SSO) | Fonctionnalité requise en haute priorité pour l'adoption B2B "SaaS-grade". |
| **P1** | **Intégrations** | Fiabilisation Sync CRM | Rendre HubSpot/Salesforce robustes (mappage, statuts, erreurs). |
| **P1** | **Transparence IA** | Clarification Lead Detail | Afficher la ventilation explicite du score (Final, ICP, Signal) selon les 5 dimensions. |
| **P2** | **Redondance IA** | Multi-fournisseurs LLM | Actuellement, **Claude (Anthropic) est l'unique fournisseur réel**. L'ajout d'alternatives n'est qu'une amélioration future. |
| **Hors Scope** | **Monétisation** | Stripe Self-Serve | La facturation (billing) reste **assistée par les ventes (sales-assisted)**. L'automatisation Stripe n'est pas un prérequis actuel. |
