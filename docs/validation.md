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

- Clerk: os cinco CNAMEs foram configurados em 19/10/2026 e o DNS público está correto. O DNS e o HTTPS do Clerk foram ativados em 19/10/2026; o formulário de login renderiza em produção. Validar cadastro, entrada, sessão, username e histórico com uma conta real.
- Confirmar a execução automática diária pelo agendador. A rota e sua autorização foram testadas manualmente; o teste não espera a próxima janela diária.
- Exercitar Safari/iOS real e transferências no tamanho máximo em redes móveis antes de ampliar o uso.

Os testes usaram apenas artefatos sintéticos. Não comprovam prazos internos de retenção, backups ou caches dos provedores. O plano Vercel permanece Hobby; nenhuma mudança para plano pago foi realizada.

## Evolução da área autenticada — 18/10/2026

- Migração `002_account_controls` aplicada no Neon de produção em transação, com advisory lock, antes da publicação do código. Sem alteração de regras ou material criptográfico de artefatos existentes.
- 46 testes passaram em PostgreSQL 17 real, com conexões concorrentes. Casos novos cobrem limites de 2/5 MiB, escopo da conta no HTTP e no serviço, username imutável no banco, paginação além de 100 registros, contadores agregados, replay de prova inválida, orçamento de desafios pendentes, falhas acumuladas, abandono sem cron, concorrência entre limpeza e prova válida e múltiplos lotes de kill-switch.
- Typecheck, formatação e build de produção passaram. A validação visual dos componentes reais em Chromium usou um servidor local e respostas HTTP simuladas: onboarding, paginação, remoção, ID personalizado, kill-switch somente na conta e rejeição de arquivos acima de 2/5 MiB antes de qualquer reserva. Corrigida a posição do contêiner da tabela para evitar overflow da página em viewport de 390 px.
- O painel mostra entregas autorizadas, sem afirmar que sejam descriptografias ou leituras concluídas. As aberturas de página são estimativas agregadas iniciadas nesta evolução. Não foram adicionados cookies de analytics, rastreamento de destinatários ou conteúdo em claro no histórico.
- O navegador real de produção ainda não carrega o Clerk: erro de CORS no script servido por `clerk.rafael.run`, com tela sem campos de login. A configuração DNS exata do Clerk continua necessária para verificar cadastro/sessão e o painel autenticado de ponta a ponta em produção; os testes de painel com respostas simuladas não substituem essa verificação.
- Publicação `f497122` concluída no domínio de produção. CI [39083399770](https://github.com/toruticas/efemero/actions/runs/39083399770) passou, incluindo testes em PostgreSQL real e build.
- Chromium contra produção: arquivo binário de exatamente 2 MiB criado via OPAQUE/Blob privado, senha incorreta finalizada com prova rejeitada (404), senha correta autorizada (200), nome original recuperado no navegador e download idêntico byte a byte. O limite de uma entrega impediu novo início (404). Arquivo acima de 2 MiB foi bloqueado no navegador sem reserva; uma reserva cifrada acima do orçamento anônimo foi rejeitada pela API (400). `/api/account` sem sessão retornou 401. As chamadas de API não incluíram senha ou nome original do arquivo, e o navegador não registrou erros JavaScript. Os artefatos de QA foram revogados ou esgotados para remoção pelo fluxo normal.

## DNS do Clerk — 19/10/2026

- Valores exatos recebidos do prompt gerado pelo Clerk, incluindo os destinos DKIM e de e-mail específicos desta aplicação. Antes da alteração, nenhum dos cinco CNAMEs existia; havia resposta curinga da Vercel.
- CLI oficial autenticado como `toruticascom`; projeto `efemero` e equipe `vercel-toruticascos-projects` confirmados antes das criações individuais. Cinco registros criados com sucesso. Nenhum plano ou serviço pago foi contratado.
- Conferência pela API da Vercel: 21 registros no total; os 16 registros anteriores preservaram IDs, nomes, tipos, valores, TTLs, prioridades MX e comentários. DMARC mantido em `p=quarantine`.
- Resolver DNS público retornou os cinco destinos CNAME esperados e os nameservers da Vercel. Não havia registros próprios desses nomes com valores errados; todos os cinco estavam ausentes.
- Primeiro teste de navegador depois da mudança: `/sign-in` respondeu 200, mas o script Clerk ainda falhou. Requisição HTTPS ao script confirmou erro TLS no upstream, sem desabilitar verificação de certificado. Foi solicitado repetir a verificação do domínio no painel do Clerk; não considerar o formulário ou a sessão autenticada validados até esse teste passar.

- O proprietário informou que concluiu a verificação no Clerk. O teste imediatamente posterior ainda recebeu erro `SSLV3_ALERT_HANDSHAKE_FAILURE` do upstream HTTPS em `clerk.rafael.run`; por enquanto a ativação do certificado não foi comprovada. Os CNAMEs públicos permanecem corretos.

- Documentação oficial do Clerk confirmou uma etapa explícita **Deploy certificates** após o checklist de produção. Os CAA públicos permitem LetsEncrypt (`letsencrypt.org`) e Google Trust Services (`pki.goog`), além do emissor já existente; não foram removidos ou alterados. Foi solicitado concluir a ativação dos certificados no Clerk.

- Rechecagem posterior: script `clerk.browser.js` respondeu 200, com tipo JavaScript e CORS permitido. Chromium renderizou os campos de identificador e senha e o botão Continuar. Os testes não desabilitaram verificação TLS.
- O carregamento real revelou violações CSP no Clerk Protect: workers `blob:` e sondagens HTTPS em portas além de 443. Ajustadas somente as páginas `/app`, `/sign-in` e `/sign-up`, conforme a [documentação CSP do Clerk](https://clerk.com/docs/guides/secure/best-practices/csp-headers). As páginas públicas mantêm workers restritos à própria origem. Telemetria opcional do SDK desabilitada; proteções de abuso continuam habilitadas. O teste de política cobre os dois grupos de rotas e prefixos parecidos.
- Typecheck, 47 testes locais e build de produção passaram após o ajuste CSP. A execução de formulário e sessão de um usuário real não foi automatizada.
