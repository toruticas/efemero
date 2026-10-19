# Configuração e publicação

## Repositório privado

O repositório informado pelo proprietário é [`toruticas/efemero`](https://github.com/toruticas/efemero). Mantenha a visibilidade **Private** e autorize a integração somente para esse repositório quando possível. Verifique `private: true` pela API antes de enviar o código. Não copie `.env.local`, tokens ou o diretório de autenticação do CLI.

## Domínio principal

O domínio escolhido é **efemero.rafael.run**, inteiramente em ASCII e sem acento. O nome do produto e do projeto é **Efemero**.

Configure `APP_ORIGIN=https://efemero.rafael.run` somente no ambiente de produção. Use essa mesma origem na configuração do Clerk e em seus callbacks.

Associe esse hostname ao projeto `efemero` e obtenha os registros DNS e eventuais desafios de propriedade que a Vercel retornar. Não use um destino CNAME genérico. A associação só estará concluída depois de verificar DNS, certificado HTTPS e os fluxos da aplicação nesse endereço.

O projeto `prj_VQR4e2oJNhmkv8lgCe4dpQ3RSLAC` pertence à equipe `team_iE6kuuhAKPwML0NhvJVmmrPj` (`vercel-toruticascos-projects`). `efemero.rafael.run` está associado, verificado e publicado por HTTPS. A publicação automática de `70f304a` foi confirmada em `dpl_FrW5sgL2LhPw4yQNEmwaxaqbSqy4`; as entregas anônimas foram exercitadas em Chromium contra os serviços reais.

## Estado do provisionamento

- Neon: projeto `old-tooth-31877519`, branch `br-morning-sound-b8fxg85q` (`production`), banco `efemero`, PostgreSQL 17 em `aws-us-east-1`. Migração `001_initial` aplicada em transação pela integração autenticada e confirmada na tabela de versões. Pool de conexões habilitado e histórico de restauração configurado em zero.
- Blob: store `store_UDExr0Rlu7Ri4KZG` (`efemero-production`), acesso privado, região `iad1`.
- Variáveis do serviço configuradas somente em produção, incluindo os segredos OPAQUE e a conexão ao banco. O token Blob foi restringido a produção e marcado como sensível. Upload, commit, leitura e download foram validados pela aplicação publicada, sem copiar esse token para o navegador.
- Clerk instalado na equipe: configuração `icfg_HRrgUWb30vz3mQ90d8bPt7gr`, plano Hobby, produto `clerk-alizarin-grass`. As duas chaves Clerk chegaram ao projeto para produção e preview. O Frontend API configurado é `clerk.rafael.run`. Em 19/10/2026 os cinco CNAMEs exigidos foram criados pelo CLI oficial e conferidos na API Vercel e no DNS público. O proprietário informou que concluiu a verificação DNS no Clerk. O script do Frontend API responde 200 por HTTPS e o formulário de login foi renderizado em Chromium; cadastro e sessão com conta real ainda precisam ser exercitados.
- Plano Hobby mantido. O cron `0 3 * * *` agenda a limpeza diária, com vários lotes dentro de um orçamento de execução; a resposta indica `limited: true` se houver trabalho restante por limite de tempo ou de lotes. A inicialização das exclusões usa uma operação SQL em lote. O bloqueio por expiração é imediato e independente do agendador.

O script de migração usa a importação padrão de `@next/env`, compatível com a execução ESM no Node.js 24. A conexão WebSocket da aplicação ao Neon foi validada em produção. Não copie os segredos locais para documentação ou para o Git.

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

Na integração nativa da Vercel, instalar o Clerk na equipe e conectar sua aplicação ao projeto são etapas separadas. No dashboard da equipe, abra **Integrations → Clerk** e o recurso Clerk criado. Na aba **Projects**, use **Connect Project**, selecione `efemero` e confirme **Connect**, sem prefixo personalizado nas variáveis. Se ainda não existir um recurso, crie a aplicação `efemero` no plano Hobby, com domínio de produção `efemero.rafael.run`, antes de conectá-la. A conexão sincroniza automaticamente as chaves por ambiente. Confira a configuração do domínio de produção no recurso e o DNS do Clerk antes de publicar.

Referências: [instalação e vínculo Clerk](https://clerk.com/docs/guides/development/integrations/platforms/vercel-marketplace), [conectar recurso a um projeto Vercel](https://vercel.com/docs/integrations/install-an-integration/product-integration). A instalação do plugin Vercel no ChatGPT não instala nem conecta esse recurso por conta própria.

### DNS do Clerk

A aplicação continua em `efemero.rafael.run`. O domínio primário do Clerk é `rafael.run`, com Frontend API em `clerk.rafael.run` e portal em `accounts.rafael.run`. Os nomes abaixo são relativos a `rafael.run`; todos usam CNAME, TTL de 60 segundos, sem proxy.

| Nome              | Destino                             |
| ----------------- | ----------------------------------- |
| `accounts`        | `accounts.clerk.services`           |
| `clerk`           | `frontend-api.clerk.services`       |
| `clk._domainkey`  | `dkim1.xx88d1upb0a2.clerk.services` |
| `clk2._domainkey` | `dkim2.xx88d1upb0a2.clerk.services` |
| `clkmail`         | `mail.xx88d1upb0a2.clerk.services`  |

Os cinco registros estavam ausentes; os IPs observados antes eram respostas do curinga da Vercel. A criação individual preservou os 16 registros preexistentes, incluindo o TXT DMARC `v=DMARC1; p=quarantine`. Não trocar a política DMARC existente por uma política menos restritiva. Nameservers confirmados: `ns1.vercel-dns.com` e `ns2.vercel-dns.com`.

Depois de salvar os registros, repetir a verificação em **Clerk → Domains → Configure** e concluir **Deploy certificates** na Overview / checklist de produção. Essa etapa do Clerk ativa o HTTPS da instância; consulte a [documentação de certificados](https://clerk.com/docs/guides/development/deployment/production#deploy-certificates). DNS aceito pela Vercel não comprova a emissão do certificado ou a ativação do domínio no Clerk. Conferir HTTPS do Frontend API e carregamento do formulário antes de considerar o login liberado.

A operação de importação de zona do conector retornou erros sem alterar os registros. Para esta configuração foi usado `vercel dns add` individualmente, com equipe explícita e sessão própria do CLI. O diretório de autenticação e a cópia privada da zona ficam fora do repositório.

O provider e os scripts do Clerk ficam na área de contas; a página compartilhada não carrega esse provider. O envio opcional de telemetria do SDK está desabilitado. Somente `/app`, `/sign-in` e `/sign-up` permitem workers `blob:` e conexões HTTPS a `*.protect.clerk.com` em portas adicionais, exigidas pela proteção de abuso do Clerk. Os scripts mantêm nonce e `strict-dynamic`, sem `unsafe-eval` em produção. O username é mantido pela aplicação e é imutável, com proteção no banco. Definir username e consultar histórico exigem identidade verificada no backend.

## Limpeza e limites

`/api/cron/cleanup` exige `Authorization: Bearer <CRON_SECRET>`. O cron `0 3 * * *` agenda uma execução diária, compatível com o plano Hobby escolhido pelo proprietário. Nesse plano o horário pode variar dentro da janela da plataforma. A rotina remove objetos cujo prazo e janela de segurança já terminaram e repete exclusões que falharam; ela não faz deploy. O bloqueio do artefato verifica o prazo em cada requisição e independe da execução do cron. Deploys acompanham alterações de código na branch principal (`main`), via integração Git.

- Arquivo novo: até 2 MiB em modo anônimo e 5 MiB na área autenticada; mensagem: até 256 KiB. O orçamento cifrado inclui até 4 KiB extras de envelope.
- Kill-switch: opcional, de 1 a 100 falhas acumuladas; desafios abandonados contam após 2 minutos.
- Prazo: de 1 minuto a 7 dias, contado da reserva inicial.
- Liberações: opcional, de 1 a 100; o prazo sempre existe.
- Capacidade inicial total: 1 GiB reservado, incluindo uploads pendentes ainda não limpos.
- Conta: até 50 artefatos não purgados.
- Criação: 5 reservas por hora por origem de rede e 100 por hora no serviço.
- Autenticação: 30 inícios por origem de rede a cada 15 minutos, 15 por artefato a cada 15 minutos e 600 por minuto no serviço.

Os limites são conservadores e ficam em código nesta versão. Na Vercel, a identidade de rede usa o cabeçalho controlado pela plataforma. Fora da Vercel, todos compartilham um bucket conservador, sem confiar em cabeçalhos de IP enviados pelo cliente; adaptar a outro proxy exige revisão explícita.

A entrega é uma resposta de streaming de até 60 segundos, sem retomada. Uma interrupção após a autorização consome uma liberação. A remoção do objeto espera a janela de entrega e a expiração da permissão de upload, com margem; um inventário posterior remove gravações tardias. O histórico da conta deixa de ser listado 30 dias após o purge; o endereço continua reservado.

## Migrações da área autenticada

Aplicar `002_account_controls` antes de publicar o código desta evolução. A migração é aditiva para os dados: inclui contadores e política de falhas, amplia a lista de estados, cria índices de paginação/desafios e protege o username com um trigger. Registros existentes recebem contadores zero e kill-switch desativado. Não muda endereços, senhas, conteúdo, TTL ou regras de artefatos anteriores. O migrador percorre arquivos SQL em ordem e registra cada versão na mesma transação, com advisory lock.

## Validação antes de exposição pública

Execute a CI e um teste real de criação, upload, abertura em outro navegador, senha incorreta, último acesso, expiração e revogação nos serviços configurados. Verifique o CSP e o fluxo real do Clerk. Os testes automatizados usam OPAQUE e SQL reais, mas substituem a conexão de storage por um adaptador em memória; eles não comprovam a configuração externa de Blob ou Clerk.

O build sem credenciais deve funcionar e bloquear o compartilhamento. A primeira publicação não deve ser apresentada como operacional antes de concluir o teste nos serviços reais.
