export const metadata = { title: "Proteção e limites" };
export default function About() {
  return (
    <article className="about-page">
      <p className="eyebrow">COMO FUNCIONA</p>
      <h1>Privacidade com regras claras.</h1>
      <h2>O conteúdo é protegido no seu navegador</h2>
      <p>
        Mensagens, nomes originais e arquivos são criptografados antes do envio.
        Uma chave aleatória protege cada artefato. O protocolo OPAQUE permite
        usar sua senha para autenticar e recuperar essa chave sem enviar a senha
        original à API.
      </p>
      <h2>O link é um endereço</h2>
      <p>
        Para receber o conteúdo, o destinatário precisa provar que conhece a
        senha. O link não contém a senha ou uma chave secreta. Envie a senha por
        um canal separado e prefira a senha gerada ou uma frase longa.
      </p>
      <h2>O prazo bloqueia novas entregas</h2>
      <p>
        Quando o prazo termina ou o limite de liberações é atingido, o serviço
        bloqueia novas entregas. A limpeza remove o conteúdo em segundo plano,
        com novas tentativas quando necessário. A infraestrutura pode levar
        algum tempo para remover todas as cópias internas e caches.
      </p>
      <h2>Um acesso significa uma entrega autorizada</h2>
      <p>
        Abrir a página não consome acesso. Uma liberação é contada antes de
        iniciar a transferência. Uma conexão interrompida pode consumi-la. Não
        conseguimos comprovar leitura humana ou apagar cópias já recebidas.
      </p>
      <h2>Senhas e infraestrutura também têm limites</h2>
      <p>
        Um comprometimento que obtenha os segredos OPAQUE e os registros do
        servidor pode permitir testes offline de senhas. O operador do serviço
        também possui capacidade técnica para testar palpites. Um navegador ou
        código do site comprometido pode capturar dados durante o uso. OPAQUE
        não elimina essas condições.
      </p>
      <h2>Contas e histórico</h2>
      <p>
        Clerk cuida do login. O histórico mantém endereço, tamanho, datas,
        estado e contagem de liberações, sem texto ou nome do arquivo em claro.
        O vínculo do histórico com a conta é removido 30 dias após a exclusão do
        conteúdo. O endereço permanece reservado para impedir que links antigos
        apontem para outro artefato.
      </p>
      <h2>Compartilhamento anônimo</h2>
      <p>
        Não exige conta. A infraestrutura ainda processa informações como IP,
        tamanho e horários. A aplicação usa identificadores derivados por HMAC
        para seus limites de requisições; os provedores podem manter seus
        próprios registros operacionais. Guarde a credencial de revogação
        entregue na criação.
      </p>
    </article>
  );
}
