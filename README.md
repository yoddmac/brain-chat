# @breign/chat

Chat Breign à embarquer. Le composant appelle brain-api avec l'URL et les en-têtes que vous lui passez.

```tsx
import { BreignChat } from '@breign/chat';
import '@breign/chat/styles.css';

export function SupportChat({ token }: { token: string }) {
  return (
    <BreignChat
      api={{
        baseUrl: 'https://api.example.com',
        getHeaders: async () => ({ Authorization: `Bearer ${token}` }),
      }}
      organizationId="org_123"
      locale="fr"
      userEmail="ada@example.com"
      agents={[{ id: 'agent_1', name: 'Support', sandboxEnabled: false }]}
      features={{
        multiAgent: false,
        workspace: false,
        approvals: true,
        attachments: true,
      }}
    />
  );
}
```

## Props

- `api.baseUrl` : origine de brain-api, sans slash final.
- `api.getHeaders` : en-têtes d'authentification ajoutés à chaque appel.
- `organizationId` : organisation dont on charge les préférences de chat.
- `agents` : agents proposés. Chaque entrée a `id`, `name`, et en option `description`, `tools`, `sandboxEnabled`.
- `locale` : `fr` (défaut) ou `en`.
- `labels` : surcharge des textes. Clé pointée, par exemple `chat.conversation.send`.
- `features.multiAgent` : `true` affiche le rail, les épingles et les non-lus. `false` ne garde que le premier agent.
- `features.workspace` : fichiers du bac à sable et vue artefact.
- `features.approvals` : cartes d'autorisation des outils.
- `features.attachments` : pièces jointes dans le compositeur.
- `userEmail` : affiché dans le rail. L'initiale sert d'avatar.
- `renderUserMenu` : reçoit `{ children }` (l'avatar) pour y accrocher le menu de l'application hôte.
- `ocrAvailable` : affiche le bouton OCR sur les PDF joints.

Le composant remplit la hauteur de son parent. Le parent doit donc avoir une hauteur (`height: 100%` dans un écran, ou une zone flexible). La feuille de styles ne réinitialise pas la page hôte.

React, React DOM et `@breign/client` sont des dépendances de pair.

```bash
npm install @breign/chat react react-dom @breign/client
```

## Démo

```bash
npm run demo
```

La page place le chat dans un panneau sous un formulaire. Renseignez l'origine de brain-api et un jeton : la liste des organisations est celle que ce jeton peut ouvrir, et l'organisation choisie charge ses agents. « Plusieurs agents » les ouvre tous. Sans cette case, un seul agent est proposé dans la liste.
