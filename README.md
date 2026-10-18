# Efemero

Compartilhamento temporário de mensagens e arquivos, com criptografia no navegador e autenticação por senha antes da entrega.

## Estado

Publicado em [efemero.rafael.run](https://efemero.rafael.run), com compartilhamento anônimo de mensagens e arquivos verificado em navegador real contra Neon e Blob privado. O login ainda depende da configuração DNS do Clerk. A suíte inclui testes com PostgreSQL real e concorrência. O repositório `toruticas/efemero` é privado; alterações em `main` disparam deploy automático. O plano Vercel permanece Hobby, com limpeza diária e bloqueio imediato de acesso na expiração. Não há fallback que aceite senhas em claro ou entregue conteúdo antes da autenticação.

## Requisitos acordados

- Links anônimos em `/a/:id` e de contas em `/:username/:id`, sem segredo ou fragmento na URL.
- O destinatário recebe apenas o link e a senha por um canal escolhido pelo remetente.
- A senha original nunca é enviada à API, inclusive na criação do artefato.
- OPAQUE por artefato autentica o destinatário antes de qualquer entrega do conteúdo cifrado.
- A chave aleatória do conteúdo é protegida a partir da `export_key` do cliente; a `session_key` compartilhada com o servidor não cifra o conteúdo.
- Expiração por tempo e limite de liberações autorizadas, aplicados atomicamente no backend.
- Clerk autentica os criadores; usuários autenticados têm username imutável, IDs personalizados e histórico paginado de metadados.
- Kill-switch opcional de 1 a 100 falhas acumuladas, definido na criação de artefatos da conta; não permite alterações posteriores.
- Aberturas de página agregadas e entregas autorizadas; sem identificação de destinatários nem alegação de leitura/descriptografia comprovada.
- Arquivos anônimos de até 2 MiB; arquivos criados na área autenticada de até 5 MiB.
- Artefatos anônimos possuem credencial de revogação independente do acesso compartilhado.

## Tecnologias

Next.js 16, React 19, TypeScript, Neon/Postgres, Vercel Blob privado, Clerk e `@serenity-kit/opaque` 1.1.0 (Rust/WASM). A versão do protocolo e os identificadores são vinculados ao artefato. O perfil Argon2id `memory-constrained` da biblioteca usa 64 MiB, 3 iterações e paralelismo 4. Criptografia e OPAQUE executam em Web Worker no navegador.

Veja [as decisões de arquitetura](docs/architecture.md).

## Executar

Requer Node.js 22 ou superior; a CI usa Node.js 24.

```sh
npm ci
cp .env.example .env.local
npm run setup:secrets
# Preencha APP_ORIGIN, DATABASE_URL e BLOB_READ_WRITE_TOKEN em .env.local.
# Configure as chaves do Clerk para habilitar a área autenticada.
npm run db:migrate
npm run dev
```

O gerador cria apenas os segredos ausentes, preserva os existentes e não exibe os valores. `.env.local` é ignorado pelo Git. No modo sem configuração, as telas permanecem acessíveis, mas o compartilhamento fica desabilitado.

## Validar

```sh
npm run typecheck
npm test
npm run format:check
npm run build
```

Por padrão os testes SQL usam PGlite. Para executar os mesmos testes com conexões concorrentes em PostgreSQL real, defina `TEST_DATABASE_URL` para um banco descartável. A suíte cria um schema isolado e o remove ao terminar. A CI usa PostgreSQL 17.

Veja [configuração e publicação na Vercel](docs/deployment.md) e [protocolo implementado](docs/protocol.md).

## Limites de segurança

O serviço controla novas entregas, sem poder apagar cópias já recebidas. Uma liberação autorizada não comprova leitura humana ou conclusão do download. Senhas fracas continuam vulneráveis a palpites; um comprometimento que obtenha o material OPRF e os registros permite tentativas offline. O operador também possui capacidade técnica para testar palpites. Um navegador ou frontend comprometido pode capturar os dados durante o uso.
