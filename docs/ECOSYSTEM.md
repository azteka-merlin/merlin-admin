# Contexto Do Ecossistema Merlin

O Merlin tem quatro projetos. Antes de criar uma tela, rota ou fluxo de pagamento, confirme qual projeto e dono daquela responsabilidade.

| Projeto | Responsabilidade | Nao e responsavel por |
| --- | --- | --- |
| `Merlin-public` | Site publico, incluindo a tela existente de planos/cadastro em `/download`, selecao visual e redirecionamento para pagamento. | Regras de preco, criacao de licenca, Stripe, Pix ou ativacao no Launcher. |
| `Merlin-admin` | Painel operacional: configuracao de planos e Price IDs, licencas, jogos Premium, atualizacoes e auditoria. | Servir a experiencia publica de compra ou criar rotas publicas. |
| `Merlin-api` | Fonte de verdade de D1, billing, Stripe, Pix, licencas, feature flags e APIs. Tambem entrega assets ja compilados conforme o deploy. | Definir o visual publico a partir de HTML inline ou de uma POC. |
| Launcher | Aplicacao local que usa a licenca e aplica a ativacao. | Decidir preco, checkout ou configurar planos. |

## Contrato De Planos

- O Admin configura disponibilidade e Price IDs. O Public consulta os dados e envia somente a selecao.
- A API valida o price e o tier, cria checkout/Pix e persiste a licenca. Nunca confiar em valor vindo do navegador.
- Os cards vivem na tela publica existente em `/download`. Nao criar uma tela ou rota `/checkout` para reproduzir uma referencia visual.
- Stripe Checkout continua externo. O retorno volta para `/download`, que leva a pessoa para `Meu acesso`.
- Pix e manual quando o plano assim exigir; cartao recorrente segue a assinatura Stripe.

## Contrato De Ativacao Premium

Para ativações Premium, a ativacao continua contabilizada quando `completePremiumActivation` conclui no backend. Bronze consome uma ativacao e os cooldowns sao aplicados nesse momento. Nao mover essa confirmacao para depois da etapa local, nao criar rollback automatico e nao criar endpoint extra de confirmacao sem task especifica.

## Checklist Antes De Implementar

1. Identificar o projeto dono da tela e o dono da regra.
2. Conferir se uma rota/tela equivalente ja existe antes de criar outra.
3. Quando houver POC, usar somente layout, interacoes e icones como referencia visual.
4. Preservar contratos de API, Stripe, Pix e Launcher ja aprovados.
5. Validar em desktop e celular a tela que realmente sera publicada.
