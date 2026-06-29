# Merlin Admin

Painel administrativo do Merlin.

O Merlin Admin é a interface usada para acompanhar e gerenciar a operação do ecossistema Merlin em um só lugar.

Com ele, é possível:

- criar, atualizar, renovar, revogar e reativar licenças
- visualizar atividade de usuários e eventos administrativos
- consultar dispositivos vinculados e redefinir HWIDs
- gerenciar overrides de manifests e fixes por App ID
- publicar e acompanhar updates do Merlin
- revisar bloqueios e ajustes básicos de segurança

## Objetivo

O foco do projeto é dar uma visão clara e prática da operação do Merlin, com ferramentas simples para suporte, manutenção e administração.

## Stack

- React
- Vite

## Estrutura

- `src/components` — componentes reutilizáveis da interface
- `src/pages` — páginas principais do painel
- `src/lib` — helpers, utilitários e regras de apoio à UI
- `public` — arquivos públicos estáticos

## Scripts

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Observações

- `package-lock.json` é versionado para manter instalações mais previsíveis
- `dist/`, `node_modules/` e arquivos temporários não devem ser commitados
