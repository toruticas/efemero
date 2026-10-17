# Configuração e publicação

## Repositório privado

O repositório informado pelo proprietário é [`toruticas/efemero`](https://github.com/toruticas/efemero). Mantenha a visibilidade **Private** e autorize a integração somente para esse repositório quando possível. Verifique `private: true` pela API antes de enviar o código. Não copie `.env.local`, tokens ou o diretório de autenticação do CLI.

## Região

`vercel.json` prepara as Functions em `iad1` (EUA). Configure Neon e Blob em regiões compatíveis e próximas antes de publicar. A região do ambiente de desenvolvimento é independente; não há garantia de residência de todos os dados apenas por definir a região das Functions. Identidade, logs, backups e caches têm configurações próprias nos provedores.

## Neon

Crie um projeto e uma base separados para produção. Use o endereço fornecido pelo Neon em `DATABASE_URL`; o adaptador usa `@neondatabase/serverless` com conexões WebSocket para suportar transações interativas. Cada operação de liberação verifica o registro no banco primário, não em réplica ou cache.

Execute `npm run db:migrate` com a configuração do ambiente de destino. O script usa uma transação, um bloqueio de migração e uma tabela de versões. Falhas são apresentadas sem imprimir a URL do banco.

## Blob privado

Crie um store **Private** dedicado ao projeto, na região escolhida. Configure `BLOB_READ_WRITE_TOKEN` somente no servidor. O acesso ao storage nunca usa uma variável `NEXT_PUBLIC_*`.

O navegador recebe uma permissão de PUT para um único caminho reservado, sem sobrescrita, até 15 minutos e limitada ao tamanho declarado. O commit consulta o objeto pelo caminho calculado no servidor; URLs do cliente não são aceitas. Uma configuração de store público é recusada ao validar o upload.

Uploads usam o prefixo `artifacts/`. A tarefa de limpeza mantém um cursor de inventário para remover arquivos que reapareçam depois da exclusão, inclusive transferências tardias. Não reutilize esse prefixo em outra aplicação.

## Segredos do serviço

Execute `npm run setup:secrets` num ambiente de confiança. Configure os valores gerados pelo canal de secrets da Vercel, sem colá-los em issues, código, commits ou logs.

| Variável               | Uso                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `APP_ORIGIN`           | Origem HTTPS canônica do ambiente; valida Origin e vincula o contexto OPAQUE.                   |
| `OPAQUE_SERVER_SETUP`  | Configuração secreta da biblioteca OPAQUE, incluindo material OPRF e chave privada do servidor. |
| `OPAQUE_SETUP_VERSION` | Versão da configuração; começa em `1`.                                                          |
| `HANDSHAKE_SEAL_KEY`   | Chave AES de 32 bytes em base64url para proteger estados temporários no banco.                  |
| `RATE_LIMIT_HMAC_KEY`  | Chave independente para pseudonimizar os identificadores dos limites de requisição.             |
| `CRON_SECRET`          | Autenticação da tarefa de limpeza.                                                              |

Mantenha backups protegidos dos segredos enquanto existirem artefatos dependentes. A versão atual recusa novos handshakes com configuração diferente da usada na criação. Ela não implementa migração automática nem um keyring de seeds antigas: não troque o setup com artefatos ativos. Para o MVP, espere os artefatos expirarem antes de substituir o setup. A rotação do segredo de estado invalida autenticações em andamento.

Cada ambiente tem segredos, banco e store próprios. Um preview não deve compartilhar as credenciais de produção.

## Clerk

Crie uma aplicação Clerk e configure `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` e `CLERK_SECRET_KEY`. Configure URLs de entrada e cadastro como `/sign-in` e `/sign-up`, com destino `/app`. Cadastre as origens e callbacks permitidos no Clerk.

O provider e os scripts do Clerk ficam na área de contas; a página compartilhada não carrega esse provider. O username é mantido pela aplicação e permanece imutável nesta versão. Definir username e consultar histórico exigem identidade verificada no backend.

## Limpeza e limites

`/api/cron/cleanup` exige `Authorization: Bearer <CRON_SECRET>`. O agendamento de minuto em minuto requer plano Vercel compatível. Uma alternativa é um agendador externo autenticado. O bloqueio do artefato verifica o prazo em cada requisição e independe da execução do cron.

- Arquivo: até 25 MiB; mensagem: até 256 KiB.
- Prazo: de 1 minuto a 7 dias, contado da reserva inicial.
- Liberações: opcional, de 1 a 100; o prazo sempre existe.
- Capacidade inicial total: 1 GiB reservado, incluindo uploads pendentes ainda não limpos.
- Conta: até 50 artefatos não purgados.
- Criação: 5 reservas por hora por origem de rede e 100 por hora no serviço.
- Autenticação: 30 inícios por origem de rede a cada 15 minutos, 15 por artefato a cada 15 minutos e 600 por minuto no serviço.

Os limites são conservadores e ficam em código nesta versão. Na Vercel, a identidade de rede usa o cabeçalho controlado pela plataforma. Fora da Vercel, todos compartilham um bucket conservador, sem confiar em cabeçalhos de IP enviados pelo cliente; adaptar a outro proxy exige revisão explícita.

A entrega é uma resposta de streaming de até 60 segundos, sem retomada. Uma interrupção após a autorização consome uma liberação. A remoção do objeto espera a janela de entrega e a expiração da permissão de upload, com margem; um inventário posterior remove gravações tardias. O histórico da conta deixa de ser listado 30 dias após o purge; o endereço continua reservado.

## Validação antes de exposição pública

Execute a CI e um teste real de criação, upload, abertura em outro navegador, senha incorreta, último acesso, expiração e revogação nos serviços configurados. Verifique o CSP e o fluxo real do Clerk. Os testes automatizados usam OPAQUE e SQL reais, mas substituem a conexão de storage por um adaptador em memória; eles não comprovam a configuração externa de Blob ou Clerk.

O build sem credenciais deve funcionar e bloquear o compartilhamento. A primeira publicação não deve ser apresentada como operacional antes de concluir o teste nos serviços reais.
