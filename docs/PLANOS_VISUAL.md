# Planos: Referencia Visual E Limites

## Referencia

A POC visual esta em `C:\Users\Usuario\Videos\merlin-planos`. Ela serve exclusivamente como referencia de cards:

- composicao, hierarquia, espacamento e tipografia;
- toggle Mensal/Anual;
- badges, hover e estado selecionado;
- icones `Check`, `Clock`, `Zap` e comparacao expansivel.

Nomes comerciais e beneficios exibidos no Merlin podem diferir dos dados ficticios da POC. Precos, disponibilidade e regras sempre vem da API/Admin.

## Erro A Evitar

Nao transformar uma POC visual em uma rota ou produto paralelo. Em particular, nao criar ou manter uma pagina `/checkout` para renderizar os cards de planos.

No Merlin, os cards pertencem a tela publica existente em `/download`. Checkout e um fluxo da API que redireciona para Stripe ou inicia Pix; ele nao e uma pagina visual separada. Quando o pedido for substituir a tela de planos, a mudanca fica no componente de planos do `Merlin-public` e preserva cadastro, `Meu acesso`, recuperacao e pagamentos existentes.

## Revisao Obrigatoria

1. Abrir POC e tela real lado a lado.
2. Comparar estrutura, tamanhos, espacamentos, cores, badges, icones e responsividade.
3. Confirmar que o URL publicado continua `/download`.
4. Confirmar que nenhum asset ou script publico foi acoplado ao build do Admin.
5. Testar a selecao de cada tier e ciclo sem alterar o contrato de billing.
