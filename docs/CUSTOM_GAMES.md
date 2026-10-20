# Atualizações e integridade dos jogos

## Cadastro e publicação

Em **Baixe e Jogue**, escolha a origem **Nativo** ou **Port**. A versão publicada
é um rótulo opcional para identificar o pacote. Para ports, o repositório GitHub
permite avisar o administrador sobre novas releases, e o Discord é opcional.
Informe em **Tag da release incluída no pacote** a tag que corresponde aos
arquivos enviados. A release do repositório precisa ser preparada, enviada e
publicada no cadastro antes de ficar disponível aos clientes.

Uma nova versão pode ser enviada como ZIP completo ou pasta completa. O
Launcher compara o manifesto instalado com o novo para baixar os arquivos
necessários. Os caminhos preservados são relativos à instalação, um por linha;
use-os para saves e configurações locais. A pasta `game` sempre é preservada
durante a atualização de um port.

## Fila de indexação

Abra **Integridade dos jogos** no menu. A tela mostra a cobertura do catálogo e
as tarefas na fila, em execução, concluídas, canceladas ou com erro. O progresso
inclui dados lidos e arquivos processados conforme o serviço os informa.

- **Indexar pendentes** adiciona os jogos sem índice.
- **Indexar** e **Reindexar** atuam sobre um jogo.
- **Reindexar catálogo** solicita uma nova leitura dos ZIPs e dos pacotes
  antigos sem hashes. Pastas com manifesto completo reaproveitam seus hashes.
- **Cancelar** encerra uma tarefa; **Tentar novamente** devolve uma tarefa com
  falha ou cancelada à fila.

O índice contém caminho, tamanho e SHA-256 de cada arquivo instalado. O hash do
ZIP inteiro não substitui os hashes de seus arquivos internos. Pastas enviadas
pelo fluxo atual já têm esses dados; os ZIPs antigos precisam ser lidos uma vez
pelo serviço de indexação.

## Serviço de indexação

A fila é processada automaticamente por **Cloudflare Queues e Workers**, com
estado e checkpoints no R2. O Worker consulta os arquivos do ZIP por intervalos
e calcula SHA-256 e CRC32 em streaming. O processamento continua com o painel
fechado e não depende de computador local, VPS ou serviço Node externo.

Consulte [`CUSTOM_GAME_INDEXING_CLOUDFLARE.md`](../../Merlin-api/docs/CUSTOM_GAME_INDEXING_CLOUDFLARE.md)
no projeto da API para os bindings, os limites e as opções operacionais.

A tela consulta a fila a cada cinco segundos enquanto há tarefas ativas e a
fila está configurada. Em erro, a consulta automática para; use **Atualizar dados**
após corrigir o problema. Fechar a página não cancela o processamento.
