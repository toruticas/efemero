# Decisões de arquitetura

## Identificação e identidade

O caminho curto é um localizador, não uma credencial. O identificador interno imutável do artefato vincula registro OPAQUE e contexto criptográfico, independentemente de username e slug públicos. Slugs devem ser únicos por usuário e não devem ser reutilizados automaticamente após expiração. Prefixos de sistema são reservados.

Clerk identifica o criador e autoriza a administração dos seus próprios artefatos. A autenticação do destinatário é independente da conta do criador e não exige login no Clerk.

## Autenticação e criptografia

Um registro OPAQUE é criado por artefato. A API nunca recebe a senha original. O navegador gera uma chave aleatória de conteúdo, cifra o payload com criptografia autenticada e protege essa chave usando material derivado da `export_key` do OPAQUE, com separação de contexto e vínculo ao artefato.

A `export_key` fica no cliente. A `session_key` é conhecida por cliente e servidor e não deve ser usada para cifrar a chave do conteúdo. Não incluir uma derivação alternativa apenas de senha e salt público que crie um teste offline independente do OPAQUE.

A aplicação usa uma biblioteca OPAQUE existente; não implementa primitivas ou um protocolo de desafio e resposta próprio. Parâmetros e formato devem ter versionamento. A revisão da biblioteca deve verificar o suporte ao navegador, runtime Node, endurecimento de senha e proteções de implementação.

O servidor mantém os segredos OPAQUE fora do banco. Um vazamento isolado de banco/storage e um comprometimento da aplicação inteira têm propriedades distintas. Seed OPRF e registro permitem testes offline mesmo sem a chave privada AKE. A conservação, versão e rotação desses segredos devem respeitar a vida útil dos registros; a perda da seed pode tornar o conteúdo irrecuperável mesmo com a senha correta.

## Fluxo de criação

1. Reservar um artefato pendente e aplicar quotas antes de iniciar operações custosas.
2. Executar registro OPAQUE no navegador e no backend, vinculando-o à reserva autorizada.
3. Criptografar no navegador, incluindo nomes originais e metadados sensíveis.
4. Enviar ciphertext diretamente ao storage privado mediante autorização restrita ao objeto e ao tamanho.
5. Validar conclusão do upload antes de publicar o artefato.

Reservas e uploads abandonados têm prazo e são removidos pela limpeza. Callbacks de upload não podem reativar artefatos revogados ou expirados.

## Fluxo de entrega

1. Abrir a página não consome liberação nem entrega o payload.
2. Aplicar rate limiting ao início do handshake, inclusive quando o cliente abandona antes da prova final.
3. Validar a prova OPAQUE final e impedir replay do estado temporário.
4. Em decisão atômica no banco primário, verificar estado, prazo e limite; consumir uma liberação.
5. Transmitir ciphertext pelo gateway autorizado, sem credenciais do storage ou link reutilizável que permita contornar a política.
6. Desbloquear a chave e descriptografar no navegador.

O MVP conta a liberação ao iniciar a entrega. Falhas de conexão podem consumi-la. A conclusão humana da leitura não é verificável. Estado de autenticação não depende da memória de uma única Function. Falhas no banco bloqueiam a entrega.

## Expiração e exclusão

O backend usa horários absolutos calculados pelo servidor e permite combinar prazo com número máximo de liberações. Existe prazo máximo obrigatório. A primeira condição atingida bloqueia novas entregas.

A verificação acontece na requisição, não depende do cron. A limpeza remove objetos com novas tentativas e trata uploads órfãos. Entregas já autorizadas têm janela máxima explícita. Exclusão física de dados/caches do provedor pode ter atraso; não prometer apagamento de cópias externas ou imediato de toda a infraestrutura.

O painel retém apenas o histórico mínimo com política de retenção documentada. Expiração do payload não implica retenção ilimitada de seus metadados.

## Segurança da aplicação

- Bucket privado e autorização junto à leitura do objeto.
- Respostas de conteúdo com `Cache-Control: private, no-store`.
- Mensagens renderizadas como texto; conteúdo ativo não executa na origem da aplicação.
- Senhas, chaves, material intermediário e provas não entram em logs ou analytics.
- Página de abertura sem scripts de terceiros desnecessários.
- Limites de tamanho, prazo, frequência e armazenamento para contas e anônimos.
- Credencial de revogação anônima independente da senha compartilhada.
- Testes reais de autenticação, senha incorreta, isolamento entre artefatos, replay, concorrência, expiração, quotas e exclusão.

## Operação inicial

Limite inicial pretendido de 25 MB por artefato. Upload direto ao Blob privado e download por streaming. Vercel Cron para limpeza frequente depende de plano compatível; o bloqueio temporal funciona independentemente do cron. A configuração de serviços reais e segredos ocorre por canais seguros, nunca por commits.

Publicação e exposição pública exigem comportamento completo e serviços configurados. Não substituir o produto por uma demonstração que entregue ciphertext antes da autenticação ou que guarde senhas/chaves em claro.

