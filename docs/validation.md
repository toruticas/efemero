# Validação — 17/10/2026

## Resultado

- TypeScript: sem erros.
- Build Next.js de produção: concluído, incluindo Web Worker da criptografia e rotas de API.
- Vitest: 32 testes; execução padrão com PGlite e CI com PostgreSQL 17 real. Inclui fila diária maior que um lote de exclusão.
- Formatação: Prettier e `git diff --check` sem erros.
- `npm audit --omit=dev`: nenhuma vulnerabilidade conhecida reportada pelo registry nesta data. Isso não equivale a uma auditoria criptográfica.
- HTTP no servidor de produção local: páginas inicial, abertura, informações, revogação e conta responderam; CSP com nonce por resposta foi compatível com os scripts renderizados; cabeçalhos de não armazenamento e bloqueio de frames presentes.
- HTTP: Origin externo recusado; acesso por GET ao endpoint de entrega recusado; ausência de credenciais bloqueou o compartilhamento sem devolver envelope ou conteúdo.

## Comportamentos exercitados

OPAQUE real para registro e autenticação, recuperação estável da export key, senha incorreta, isolamento entre artefatos, autenticação antes da leitura do storage, envelope cifrado, integridade do payload, chave e contexto incorretos, replay, último acesso concorrente, expiração sem cron, expiração do handshake, revogação concorrente, idempotência, falha e repetição da exclusão, gravação tardia depois de purge, autorização de upload e escopo do proprietário. O último acesso também remove o registro OPAQUE e o envelope do banco.

O PostgreSQL real usa conexões independentes para testar concorrência. O adapter de storage em memória substitui apenas o provedor de objetos; os testes não substituem a criptografia por mocks. Há testes separados da fronteira HTTP com mocks para verificar que uma prova recusada nunca dispara leitura do objeto.

## Acesso ao repositório

O acesso a `toruticas/efemero` foi liberado em 17/10/2026. Tanto a integração quanto o CLI confirmaram a visibilidade privada e a permissão de escrita. O commit inicial remoto, contendo apenas o título no README, foi incorporado ao histórico local, mantendo o README completo da aplicação.

## Produção e navegador real

- HTTPS em `efemero.rafael.run`: resposta 200 com certificado validado, CSP com nonce e `no-store`. Página inicial sem erros de JavaScript em Chromium.
- Integração Git: push em `main` criou automaticamente um deployment de produção na região `iad1`, sem publicação manual necessária.
- Mensagem: registro OPAQUE, cifragem pelo Web Worker, upload privado e commit reais. Abertura em outro contexto do navegador recuperou o texto corretamente. A senha incorreta não produziu entrega. As requisições observadas não continham a senha nem o texto em claro; o link não tinha fragmento.
- Arquivo: upload real, recuperação de nome original e download com bytes idênticos ao arquivo sintético. Revogação retornou 200 e nova tentativa com a senha correta foi bloqueada.
- Limite de uma liberação: primeira entrega autorizada funcionou; nova tentativa recebeu 404 no início da autenticação, sem chamar o endpoint de entrega. O banco confirmou remoção do registro OPAQUE e do envelope no estado `exhausted`.
- Prazo de um minuto: nova tentativa após a expiração recebeu 404, sem entrega, antes de executar uma limpeza posterior ao prazo. O bloqueio não depende do cron.
- Limpeza: chamada sem credencial recebeu 403; chamada com o segredo configurado recebeu 200 e processou a fila. A janela de segurança dos uploads permaneceu respeitada.
- Viewport móvel em Chromium: sem rolagem horizontal, formulário e botão de criação visíveis, sem erros de JavaScript. Não equivale a teste em Safari/iPhone real.

A execução no navegador revelou uma incompatibilidade entre o CSP inicial e o endpoint de upload do SDK, `https://vercel.com/api/blob/`. O CSP foi corrigido para permitir apenas esse caminho e sua forma sem barra; o upload real passou depois da correção. As origens de scripts permanecem restritas por nonce.

## Pendências

- DNS do Clerk: `/sign-in` retorna HTML, mas o script em `clerk.rafael.run` não carrega. A consulta pública não apresentou CNAME para `clerk.rafael.run` nem `accounts.rafael.run`. Configurar os registros exatos fornecidos pelo recurso Clerk e então verificar cadastro, entrada, sessão, username e histórico.
- Confirmar a execução automática diária pelo agendador. A rota e sua autorização foram testadas manualmente; o teste não espera a próxima janela diária.
- Exercitar Safari/iOS real e transferências no tamanho máximo em redes móveis antes de ampliar o uso.

Os testes usaram apenas artefatos sintéticos. Não comprovam prazos internos de retenção, backups ou caches dos provedores. O plano Vercel permanece Hobby; nenhuma mudança para plano pago foi realizada.

## Evolução da área autenticada — 18/10/2026

- Migração `002_account_controls` aplicada no Neon de produção em transação, com advisory lock, antes da publicação do código. Sem alteração de regras ou material criptográfico de artefatos existentes.
- 46 testes passaram em PostgreSQL 17 real, com conexões concorrentes. Casos novos cobrem limites de 2/5 MiB, escopo da conta no HTTP e no serviço, username imutável no banco, paginação além de 100 registros, contadores agregados, replay de prova inválida, orçamento de desafios pendentes, falhas acumuladas, abandono sem cron, concorrência entre limpeza e prova válida e múltiplos lotes de kill-switch.
- Typecheck, formatação e build de produção passaram. A validação visual dos componentes reais em Chromium usou um servidor local e respostas HTTP simuladas: onboarding, paginação, remoção, ID personalizado, kill-switch somente na conta e rejeição de arquivos acima de 2/5 MiB antes de qualquer reserva. Corrigida a posição do contêiner da tabela para evitar overflow da página em viewport de 390 px.
- O painel mostra entregas autorizadas, sem afirmar que sejam descriptografias ou leituras concluídas. As aberturas de página são estimativas agregadas iniciadas nesta evolução. Não foram adicionados cookies de analytics, rastreamento de destinatários ou conteúdo em claro no histórico.
- O navegador real de produção ainda não carrega o Clerk: erro de CORS no script servido por `clerk.rafael.run`, com tela sem campos de login. A configuração DNS exata do Clerk continua necessária para verificar cadastro/sessão e o painel autenticado de ponta a ponta em produção; os testes de painel com respostas simuladas não substituem essa verificação.
