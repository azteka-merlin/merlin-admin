# Merlin Admin

Painel administrativo do Merlin.

Use este README como entrada principal. So abra outros docs quando a tarefa realmente pedir:

1. `docs/UP.md`: rodar, buildar, publicar e validar o painel.
2. `docs/CONTEXT.md`: arquitetura, rotas relativas e fluxos do admin.

Projeto open source: nao documente credenciais, tokens, paths pessoais, emails privados, IDs de infraestrutura ou valores sensiveis.

## Objetivo

O Merlin Admin centraliza a operacao do ecossistema Merlin:

- criar, atualizar, renovar, revogar e reativar licencas;
- visualizar atividade de usuarios e eventos administrativos;
- consultar dispositivos vinculados e redefinir HWIDs;
- gerenciar overrides de manifests e fixes por App ID;
- gerenciar jogos premium;
- publicar e acompanhar updates do Merlin;
- revisar bloqueios e ajustes basicos de seguranca.

## Stack

- React
- Vite

## Estrutura

- `src/components`: componentes reutilizaveis da interface.
- `src/pages`: paginas principais do painel.
- `src/lib`: helpers, utilitarios e regras de apoio a UI.
- `public`: arquivos publicos estaticos.

## Scripts

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Deploy

O painel nao e publicado sozinho neste setup. Ele e compilado pelo Vite e servido como assets pelo Worker do `Merlin-api`.

Use os comandos no repo da API:

```powershell
npm run deploy:panel
npm run deploy-stage:panel
```

- `deploy:panel` builda este projeto e sobe producao.
- `deploy-stage:panel` builda este projeto e sobe staging.
- O painel usa rotas relativas `/panel-api/*`; nao hardcode URLs de prod/stage aqui.

## Observacoes

- `package-lock.json` e versionado para manter instalacoes previsiveis.
- `dist/`, `node_modules/` e arquivos temporarios nao devem ser commitados.
