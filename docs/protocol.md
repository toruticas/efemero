# Protocolo do MVP

## Dependências e domínio

`@serenity-kit/opaque` está fixado em 1.1.0. A biblioteca implementa as primitivas OPAQUE; a aplicação não introduz um protocolo de senha próprio. O perfil `memory-constrained` é explícito em registro e abertura. O formato da aplicação é versão 1. Os testes exercitam a biblioteca real e comprovam que o mesmo registro recupera a mesma export key, senhas diferentes falham e IDs diferentes isolam os artefatos.

A autenticação vincula `client` ao UUID interno imutável do artefato e `server` à origem canônica. O UUID também é usado como `userIdentifier` na derivação da biblioteca. Username e slug apenas localizam esse registro.

## Registro

O navegador cria a mensagem inicial OPAQUE. `POST /api/artifacts/reserve` recebe mensagem inicial, tamanho máximo, prazo, limite e modalidade. Ele não aceita um campo de senha. O backend reserva UUID, endereço e caminho de storage, retorna a resposta OPAQUE e uma credencial aleatória de gerenciamento de 256 bits. Apenas o SHA-256 dessa credencial é armazenado.

O navegador finaliza o registro com o perfil fixo e recupera `registrationRecord` e `exportKey`. O valor `sessionKey` não é usado como chave de conteúdo.

## Criptografia

O payload em claro tem quatro bytes big-endian com o tamanho do cabeçalho JSON, o cabeçalho (`kind`, nome e MIME) e os bytes da mensagem ou arquivo. Todos esses dados são cifrados com AES-256-GCM, uma chave aleatória de 32 bytes e nonce aleatório de 12 bytes. O dado autenticado adicional é `artefatos:payload:v1:<UUID>`.

O ciphertext transmitido começa com um byte de versão (`1`), seguido de 12 bytes de nonce e do ciphertext com tag GCM. A chave de conteúdo é envolvida por outra operação AES-GCM, com nonce independente.

A chave de envolvimento é derivada via HKDF-SHA-256: o material de entrada é a codificação UTF-8 da export key retornada pela biblioteca, o salt é o UUID e o contexto é `artefatos:key-wrap:v1`. O envelope armazena versão, nonce e chave cifrada em base64url. Não há derivação paralela apenas de senha e salt público.

O navegador envia o ciphertext ao store privado e publica o registro e o envelope com `POST /api/artifacts/commit`, autenticado pela credencial de gerenciamento. A API verifica o objeto no caminho reservado antes da publicação. Nomes e MIME originais não são transmitidos em metadados públicos do upload.

## Abertura e entrega

`POST /api/artifacts/access/start` recebe caminho e mensagem OPAQUE inicial. Os limites são aplicados antes de responder, porque um atacante pode abandonar a troca após verificar seu palpite. O estado do servidor é cifrado no banco, vinculado ao artefato e válido por no máximo dois minutos ou até a expiração do artefato.

`POST /api/artifacts/access/finish` recebe o ID do handshake e a prova final. A transação bloqueia o artefato e consome o handshake, valida o prazo, o estado e a prova, incrementa o contador e, se necessário, esgota o artefato. Um handshake usado, inválido ou expirado não pode ser reapresentado; uma prova inválida consome o handshake, mas não consome uma liberação.

Somente após o commit da autorização a rota lê o objeto e responde com seu stream. O envelope da chave é enviado no cabeçalho `X-Wrapped-Key`; `X-Artifact-Id` vincula a resposta ao registro. Não há URL de GET reutilizável para contornar contadores. A resposta usa `private, no-store` e tipo binário. O cliente recupera a export key, abre o envelope e descriptografa. Conteúdo ativo nunca é renderizado como documento da origem do site.

## Limites

OPAQUE não transforma senha humana em um segredo impossível de adivinhar. O servidor que possui seed e registro pode executar tentativas offline; o operador também tem essa capacidade. Separar os segredos do banco reduz o impacto de um vazamento isolado, sem proteger contra comprometimento completo da aplicação.

O navegador precisa confiar no JavaScript entregue pelo serviço. CSP com nonce, ausência de analytics e isolamento dos scripts de login reduzem a superfície, mas não protegem contra um operador ou deploy malicioso. A versão atual não substitui uma avaliação criptográfica independente de produção.

Referências: [OPAQUE, RFC 9807](https://www.rfc-editor.org/rfc/rfc9807.html), [OPRF, RFC 9497](https://www.rfc-editor.org/rfc/rfc9497.html), [biblioteca](https://github.com/serenity-kit/opaque).
