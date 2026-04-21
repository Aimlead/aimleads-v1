# Product Requirements Document (PRD) : AIMLEAD.io

## 1. Vision et Positionnement

AIMLEAD.io est une plateforme SaaS B2B conçue pour révolutionner la qualification et la priorisation des leads commerciaux. Contrairement aux outils généralistes d'enrichissement de données, AIMLEAD.io se concentre sur l'actionnabilité immédiate : transformer une liste brute de prospects en un pipeline priorisé grâce à une évaluation rigoureuse du Profil Client Idéal (ICP) combinée à une analyse contextuelle par Intelligence Artificielle (IA). 

L'objectif principal est de permettre aux équipes commerciales, notamment les Sales Development Representatives (SDR) et les responsables de la croissance, de concentrer leurs efforts sur les prospects présentant la plus forte probabilité de conversion. En automatisant l'évaluation de l'adéquation au marché et en détectant les signaux d'intention d'achat, AIMLEAD.io réduit le temps perdu sur des prospects non qualifiés et augmente l'efficacité des campagnes de prospection.

Ce document détaille les spécifications fonctionnelles et techniques pour consolider AIMLEAD.io en tant que produit "SaaS-grade", en s'appuyant sur l'architecture existante tout en identifiant les axes d'amélioration nécessaires pour une mise à l'échelle commerciale.

---

## 2. Architecture Fonctionnelle : État des Lieux et Évolutions

L'analyse du dépôt de code existant révèle une base solide avec des mécanismes de qualification avancés. Cette section catégorise les fonctionnalités selon leur statut actuel : **Existant Confirmé** (implémenté dans le code), **À Confirmer** (nécessitant une validation en environnement de production réel), et **À Ajouter** (requis pour atteindre le standard SaaS visé).

### 2.1. Logique de Qualification et Scoring ICP

Le cœur de la valeur d'AIMLEAD.io réside dans son moteur de scoring hybride, qui combine des règles déterministes et une analyse sémantique par IA.

**Existant Confirmé :**
Le moteur de scoring actuel fonctionne en deux étapes distinctes. La première étape calcule un score ICP déterministe (`icp_score`) basé sur cinq dimensions pondérées : l'industrie, le rôle du contact, le type de client, la structure de l'entreprise et la géographie. Ce calcul applique des règles strictes d'inclusion et d'exclusion, permettant d'écarter immédiatement les prospects hors cible. La seconde étape génère un score d'intention par IA (`ai_score`) qui évalue les signaux manuels des SDR et les signaux découverts sur internet, en tenant compte de la fiabilité de la source et de la récence de l'information. Le score final (`final_score`) est une combinaison plafonnée de ces deux évaluations, traduisant le résultat en catégories claires (Excellent, Strong Fit, Medium Fit, Low Fit, Excluded) et en recommandations d'actions immédiates (ex: "Contact within 48h").

**À Confirmer :**
Bien que la logique soit implémentée et testée unitairement, la robustesse de ce modèle face à des données réelles et imparfaites doit être validée en production. L'efficacité de la découverte automatique de signaux internet (`discoverInternetSignals`) dépend fortement de la qualité des résultats des fournisseurs externes (comme NewsAPI ou la recherche web de Claude) et nécessite une évaluation qualitative sur un volume significatif de prospects réels.

**À Ajouter :**
Pour rendre ce module pleinement "SaaS-grade", il est nécessaire de développer une interface de simulation de scoring. Cette fonctionnalité permettrait aux administrateurs de tester l'impact d'une modification des pondérations ICP sur un échantillon de leads existants avant de l'appliquer à l'ensemble du pipeline. De plus, un système d'apprentissage continu, ajustant légèrement les poids en fonction des taux de conversion réels remontés par le CRM, constituerait un avantage concurrentiel majeur.

### 2.2. Analyse Contextuelle et Aide à la Prospection

Au-delà du score numérique, AIMLEAD.io fournit des éléments de contexte pour personnaliser l'approche commerciale.

**Existant Confirmé :**
L'intégration avec les modèles d'Anthropic (Claude) permet de générer des analyses qualitatives pour les leads dépassant un certain seuil de pertinence. Le système produit un résumé d'analyse (`analysis_summary`), identifie les facteurs de risque (`risk_factors`) et les signaux d'achat (`buying_signals`), et génère des amorces de conversation ("icebreakers") adaptées pour l'email, LinkedIn ou l'appel téléphonique. Une fonctionnalité de génération de séquences d'approche multi-touch (`generateOutreachSequence`) est également présente, permettant de créer des campagnes personnalisées basées sur le profil du prospect.

**À Confirmer :**
La pertinence et la personnalisation réelle des "icebreakers" générés par l'IA doivent être mesurées par les utilisateurs finaux. Le risque d'hallucination ou de production de messages trop génériques reste présent et nécessite une supervision continue des prompts utilisés. De plus, la stabilité de l'API d'Anthropic en cas de forte charge et le comportement du système de repli doivent être éprouvés.

**À Ajouter :**
L'intégration de modèles d'IA alternatifs (comme OpenAI GPT-4o ou Mistral) offrirait une redondance essentielle pour un produit SaaS, évitant la dépendance à un fournisseur unique. Par ailleurs, la possibilité pour l'utilisateur de définir ses propres directives de ton ("tone of voice") au niveau de l'espace de travail permettrait une meilleure adéquation avec l'identité de marque de chaque client.

### 2.3. Gestion de l'Espace de Travail et Plateforme SaaS

Pour être commercialisable, le produit doit offrir des garanties de sécurité, de gestion des accès et de facturation adaptées aux entreprises.

**Existant Confirmé :**
Le produit dispose d'une architecture multi-locataire (multi-tenant) robuste, gérée via Supabase. Les utilisateurs sont regroupés dans des espaces de travail (`workspaces`) avec un système de contrôle d'accès basé sur les rôles (RBAC : Owner, Admin, Member). Les fonctionnalités de gestion d'équipe incluent l'invitation de nouveaux membres, la modification des rôles et le transfert de propriété. Un système de crédits est implémenté, déduisant un coût spécifique pour chaque action coûteuse (analyse IA, découverte de signaux, génération de séquences), avec des limites définies par le plan d'abonnement (Free, Starter, Team, Scale). Un journal d'audit (`audit_log`) trace les actions sensibles, répondant aux exigences de gouvernance des clients B2B.

**À Confirmer :**
La documentation interne signale que le modèle d'identité nécessite encore une consolidation pour éviter la duplication des références utilisateurs entre les différentes tables. La procédure de suppression complète d'un membre de l'espace de travail est actuellement désactivée par mesure de sécurité et doit être finalisée. 

**À Ajouter :**
La gestion de la facturation est actuellement manuelle. Pour un SaaS autonome, l'intégration complète avec un fournisseur de paiement (comme Stripe) est indispensable. Cela inclut la gestion automatisée des abonnements, les portails de facturation en libre-service (Customer Portal), la gestion des prélèvements automatiques pour les dépassements de crédits, et la gestion des échecs de paiement (dunning process).

### 2.4. Intégrations et Écosystème

AIMLEAD.io doit s'insérer de manière fluide dans les outils existants des équipes commerciales.

**Existant Confirmé :**
Le système propose des intégrations natives avec HubSpot et Salesforce. L'architecture permet la synchronisation unitaire ou en masse des prospects, ainsi que la configuration du mappage des champs. Une API permet également l'ingestion de signaux externes (`POST /api/leads/:leadId/external-signals`), ouvrant la porte à des automatisations via des outils comme n8n ou Zapier. L'enrichissement des emails est géré via Hunter.io.

**À Confirmer :**
La robustesse de la synchronisation bidirectionnelle avec les CRM (gestion des conflits, limites de taux des API partenaires) doit être validée en conditions réelles d'utilisation intensive.

**À Ajouter :**
L'ajout d'intégrations avec des plateformes d'engagement commercial (Sales Engagement Platforms) telles que Lemlist, Outreach ou Apollo.io permettrait de pousser directement les leads qualifiés et les séquences générées dans les outils d'exécution des SDR. Une intégration native avec LinkedIn (via des extensions de navigateur ou des API partenaires) faciliterait l'importation de profils directement depuis le réseau social.

---

## 3. Recommandations Techniques et Priorisation

Pour consolider AIMLEAD.io au niveau "SaaS-grade", les efforts de développement doivent être structurés selon les priorités suivantes.

### Priorité P0 : Stabilité et Sécurité (Bloquants pour le lancement commercial)

| Composant | Action Requise | Justification |
| :--- | :--- | :--- |
| **Gestion de l'Identité** | Finaliser la réécriture du modèle de location (tenancy) pour s'appuyer exclusivement sur `workspace_members`. | Éviter les failles d'accès et les incohérences de données lors des changements d'équipe. |
| **Sécurité des Requêtes** | Remplacer la protection CSRF actuelle (basée sur `X-Requested-With`) par un système de jetons à double soumission. | Prévenir les attaques par falsification de requêtes intersites sur les actions de mutation. |
| **Exécution Asynchrone** | Remplacer la file d'attente en mémoire (`server/lib/queue.js`) par un gestionnaire de tâches distribué (ex: BullMQ avec Redis). | Garantir que les analyses longues ne sont pas perdues lors des redémarrages du serveur et permettre la mise à l'échelle horizontale. |

### Priorité P1 : Monétisation et Expérience Utilisateur (Nécessaires pour la croissance)

| Composant | Action Requise | Justification |
| :--- | :--- | :--- |
| **Facturation Automatisée** | Intégrer Stripe Billing pour gérer les abonnements, les quotas de crédits et les mises à niveau en libre-service. | Éliminer le goulot d'étranglement des ventes manuelles et permettre une acquisition de clients fluide. |
| **Validation du Scoring** | Exécuter des tests à grande échelle avec des clés d'API réelles pour calibrer les pondérations de l'IA et la découverte de signaux internet. | S'assurer que le produit délivre la valeur promise de manière constante avant d'engager des dépenses marketing. |
| **Politique de Sécurité (CSP)** | Implémenter une Content Security Policy stricte. | Protéger l'application contre les attaques XSS, une exigence standard pour les clients B2B. |

### Priorité P2 : Fonctionnalités Avancées (Différenciateurs à moyen terme)

| Composant | Action Requise | Justification |
| :--- | :--- | :--- |
| **Simulateur ICP** | Créer une interface permettant de tester l'impact des modifications de l'ICP sur des données historiques. | Donner confiance aux administrateurs lors de l'ajustement de leurs critères de ciblage. |
| **Redondance IA** | Intégrer un second fournisseur LLM (OpenAI ou Mistral) avec basculement automatique. | Assurer la continuité de service en cas de panne de l'API principale d'Anthropic. |
| **Extension Navigateur** | Développer une extension Chrome pour sourcer des leads depuis LinkedIn ou les sites d'entreprise directement vers l'espace de travail. | Réduire les frictions d'acquisition de données pour les SDR. |

---

## 4. Synthèse

AIMLEAD.io dispose d'une fondation technique impressionnante, dépassant le stade du simple prototype. Les mécanismes complexes de scoring hybride, l'isolation des espaces de travail et la gestion granulaire des crédits sont déjà présents dans le code source. L'enjeu principal pour atteindre le statut "SaaS-grade" n'est pas de réinventer le produit, mais de sécuriser l'infrastructure d'exécution asynchrone, d'automatiser le cycle de facturation et de valider empiriquement la qualité des analyses générées par l'IA en conditions réelles. En traitant les priorités P0 et P1 détaillées dans ce document, AIMLEAD.io sera positionné comme un outil de qualification de leads extrêmement compétitif sur le marché B2B.
