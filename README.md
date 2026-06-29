# Merlin Admin

Painel administrativo do Merlin.

Este projeto ? a interface web usada para gerenciar:

- licen?as
- atividade e auditoria
- overrides de manifests e fixes
- publica??o de updates do Merlin
- configura??es b?sicas de seguran?a

## Stack

- React
- Vite

## Requisitos

- Node.js 22+
- npm

## Instala??o

```bash
npm install
```

## Desenvolvimento

Inicia o painel localmente com Vite:

```bash
npm run dev
```

## Build

Gera a build de produ??o:

```bash
npm run build
```

## Preview local

Serve a build localmente:

```bash
npm run preview
```

## Integra??o com a API

O merlin-admin ? um front-end separado, mas o deploy em produ??o ? feito junto com o projeto merlin-api, que publica os assets est?ticos do painel.

Ou seja:

- este reposit?rio cuida da interface
- o deploy final do painel ? acionado a partir do merlin-api

## Estrutura

- `src/components` ? componentes reutiliz?veis
- `src/pages` ? telas principais do painel
- `src/lib` ? helpers e utilit?rios
- `public` ? arquivos p?blicos est?ticos

## Observa??es

- `package-lock.json` ? versionado para manter instala??es mais previs?veis
- `dist/`, `node_modules/` e arquivos tempor?rios n?o devem ser commitados
