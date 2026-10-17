# Validação local — 17/10/2026

## Resultado

- TypeScript: sem erros.
- Build Next.js de produção: concluído, incluindo Web Worker da criptografia e rotas de API.
- Vitest: 31 testes; execução padrão com PGlite e execução com PostgreSQL 17 real.
- Formatação: Prettier e `git diff --check` sem erros.
- `npm audit --omit=dev`: nenhuma vulnerabilidade conhecida reportada pelo registry nesta data. Isso não equivale a uma auditoria criptográfica.
- HTTP no servidor de produção local: páginas inicial, abertura, informações, revogação e conta responderam; CSP com nonce por resposta foi compatível com os scripts renderizados; cabeçalhos de não armazenamento e bloqueio de frames presentes.
- HTTP: Origin externo recusado; acesso por GET ao endpoint de entrega recusado; ausência de credenciais bloqueou o compartilhamento sem devolver envelope ou conteúdo.

## Comportamentos exercitados

OPAQUE real para registro e autenticação, recuperação estável da export key, senha incorreta, isolamento entre artefatos, autenticação antes da leitura do storage, envelope cifrado, integridade do payload, chave e contexto incorretos, replay, último acesso concorrente, expiração sem cron, expiração do handshake, revogação concorrente, idempotência, falha e repetição da exclusão, gravação tardia depois de purge, autorização de upload e escopo do proprietário. O último acesso também remove o registro OPAQUE e o envelope do banco.

O PostgreSQL real usa conexões independentes para testar concorrência. O adapter de storage em memória substitui apenas o provedor de objetos; os testes não substituem a criptografia por mocks. Há testes separados da fronteira HTTP com mocks para verificar que uma prova recusada nunca dispara leitura do objeto.

## Acesso ao repositório

O acesso a `toruticas/efemero` foi liberado em 17/10/2026. Tanto a integração quanto o CLI confirmaram a visibilidade privada e a permissão de escrita. O commit inicial remoto, contendo apenas o título no README, foi incorporado ao histórico local, mantendo o README completo da aplicação.

## Verificações externas pendentes

- Neon, Blob privado e segredos de produção provisionados; migração aplicada no Neon pela integração autenticada. Verificar a conexão da aplicação publicada com esses recursos.
- Configurar Clerk e verificar cadastro, entrada e sessão reais.
- Fazer upload, callback e download contra o Blob real.
- Exercitar o Web Worker e o CSP em navegador real, inclusive nos dispositivos móveis previstos.
- Publicar e validar o endereço implantado. Nenhuma publicação foi executada nesta etapa.

O domínio `efemero.rafael.run` foi associado ao projeto Vercel e verificado. O primeiro pedido de deploy recebeu `cron_jobs_limits_reached`: o plano Hobby não permite o cron por minuto configurado. O proprietário autorizou a rotina diária, e o cron foi ajustado para `0 3 * * *`. As chaves Clerk chegaram ao projeto em produção e preview; login real ainda não foi testado. Uma tentativa local de upload ao Blob não validou o storage: a listagem de variáveis retornou o valor cifrado, que não pode ser usado como token. O token correto permanece protegido na Vercel para uso pelo deployment.

O código está preparado para esses serviços, mas os resultados locais não comprovam permissões, integração, região ou retenção dos provedores externos.
