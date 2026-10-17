# Artefatos

Compartilhamento temporário de mensagens e arquivos, com criptografia no navegador e autenticação por senha antes da entrega.

## Estado

Repositório em preparação. A aplicação ainda não foi implementada nem publicada. O repositório remoto deverá ser privado desde a criação.

## Requisitos acordados

- Links anônimos em `/a/:id` e de contas em `/:username/:id`, sem segredo ou fragmento na URL.
- O destinatário recebe apenas o link e a senha por um canal escolhido pelo remetente.
- A senha original nunca é enviada à API, inclusive na criação do artefato.
- OPAQUE por artefato autentica o destinatário antes de qualquer entrega do conteúdo cifrado.
- A chave aleatória do conteúdo é protegida a partir da `export_key` do cliente; a `session_key` compartilhada com o servidor não cifra o conteúdo.
- Expiração por tempo e limite de liberações autorizadas, aplicados atomicamente no backend.
- Clerk autentica os criadores; usuários autenticados têm username e histórico de metadados.
- Artefatos anônimos possuem credencial de revogação independente do acesso compartilhado.

## Tecnologias previstas

Next.js e TypeScript na Vercel, Neon/Postgres, Vercel Blob privado, Clerk e implementação existente de OPAQUE para navegador e Node.js. A escolha da biblioteca requer validação de formato, parâmetros, manutenção e compatibilidade antes da implementação.

Veja [as decisões de arquitetura](docs/architecture.md).

## Limites de segurança

O serviço controla novas entregas, sem poder apagar cópias já recebidas. Uma liberação autorizada não comprova leitura humana ou conclusão do download. Senhas fracas continuam vulneráveis a palpites; um comprometimento que obtenha o material OPRF e os registros permite tentativas offline. O operador também possui capacidade técnica para testar palpites. Um navegador ou frontend comprometido pode capturar os dados durante o uso.

