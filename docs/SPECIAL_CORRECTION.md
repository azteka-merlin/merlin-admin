# Correcao especial com token de licenca

O Admin configura o override do AppID `4407750`; nao gera token, nao le arquivo de licenca e nao modifica o ZIP.

## Cadastro do override

1. Crie ou edite o override do AppID `4407750`.
2. Mantenha o fix override ativo e envie o ZIP normalmente pelo upload multipart.
3. Informe nome, nota administrativa e, se houver, uma **Cover image URL** HTTPS. Essa URL aparece no card da aba Correcoes como `imageUrl`.
4. Para a capa reutilizada de outro item, informe uma URL publica da imagem no campo. O Admin guarda a URL no override, sem codificar AppIDs de imagem no codigo.

## Contrato do ZIP

- Deve conter exatamente um `token.ini` e um `anadius.cfg`.
- Cada arquivo precisa conter uma ocorrencia literal de `RETORNO_TOKEN_MERLIN`.
- O ZIP pode ser grande; ele e baixado e extraido pelo Launcher, nao pelo Worker.
- Caminho do arquivo `.dlf`, AppID especial e regra de versao pertencem ao contrato API/Launcher e nao sao campos editaveis do painel.

## Ambientes

- O painel staging e publicado pelo repositorio da API com `npm run deploy-stage:panel`.
- `MERLIN_FILES/overrides.json` e compartilhado entre staging e producao. Salvar um override ou sua capa no painel staging altera essa configuracao compartilhada; valide os dados antes de salvar.
- O fluxo completo exige Launcher `1.6.8+`. O painel apenas cadastra os artefatos e instrucoes.
