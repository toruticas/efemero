import * as opaque from "@serenity-kit/opaque";
import { decryptArtifact, encryptArtifact } from "../lib/crypto";
import {
  KEY_STRETCHING,
  validatePassword,
  type ArtifactPayload,
  type WrappedKey,
} from "../lib/protocol";

let password = "",
  registrationState = "",
  loginState = "",
  exportKey = "";
self.onmessage = async (event: MessageEvent) => {
  const { requestId, action, data } = event.data;
  try {
    await opaque.ready;
    let result: unknown;
    if (action === "register-start") {
      validatePassword(data.password);
      password = data.password;
      const registration = opaque.client.startRegistration({ password });
      registrationState = registration.clientRegistrationState;
      result = { registrationRequest: registration.registrationRequest };
    } else if (action === "register-finish") {
      const registration = opaque.client.finishRegistration({
        password,
        clientRegistrationState: registrationState,
        registrationResponse: data.registrationResponse,
        identifiers: { client: data.artifactId, server: data.serverIdentity },
        keyStretching: KEY_STRETCHING,
      });
      password = "";
      registrationState = "";
      const encrypted = await encryptArtifact(
        data.payload as ArtifactPayload,
        registration.exportKey,
        data.artifactId,
      );
      result = {
        ...encrypted,
        registrationRecord: registration.registrationRecord,
      };
    } else if (action === "login-start") {
      validatePassword(data.password);
      password = data.password;
      const login = opaque.client.startLogin({ password });
      loginState = login.clientLoginState;
      result = { startLoginRequest: login.startLoginRequest };
    } else if (action === "login-finish") {
      const login = opaque.client.finishLogin({
        password,
        clientLoginState: loginState,
        loginResponse: data.loginResponse,
        identifiers: { client: data.artifactId, server: data.serverIdentity },
        keyStretching: KEY_STRETCHING,
      });
      password = "";
      loginState = "";
      if (!login) {
        const bytes = crypto.getRandomValues(new Uint8Array(64));
        result = {
          finishLoginRequest: btoa(String.fromCharCode(...bytes)),
          rejected: true,
        };
      } else {
        exportKey = login.exportKey;
        result = { finishLoginRequest: login.finishLoginRequest };
      }
    } else if (action === "decrypt") {
      if (!exportKey) throw new Error("Autenticação necessária.");
      result = await decryptArtifact(
        data.ciphertext,
        data.wrappedKey as WrappedKey,
        exportKey,
        data.artifactId,
      );
      exportKey = "";
    } else throw new Error("Operação desconhecida.");
    self.postMessage({ requestId, result });
  } catch {
    password = "";
    registrationState = "";
    loginState = "";
    exportKey = "";
    self.postMessage({
      requestId,
      error:
        "Não foi possível proteger ou abrir o conteúdo. Confira a senha e tente novamente.",
    });
  }
};
