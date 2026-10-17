export class CryptoSession {
  private worker: Worker;
  private requests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >();
  private nextId = 0;
  constructor() {
    this.worker = new Worker(
      new URL("../workers/crypto.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker.onmessage = ({ data }) => {
      const request = this.requests.get(data.requestId);
      this.requests.delete(data.requestId);
      if (data.error) request?.reject(new Error(data.error));
      else request?.resolve(data.result);
    };
    this.worker.onerror = () =>
      this.close(
        new Error("Seu navegador não conseguiu iniciar a criptografia."),
      );
  }
  run<T>(action: string, data: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestId = this.nextId++;
      this.requests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.worker.postMessage({ requestId, action, data });
    });
  }
  close(reason = new Error("Operação encerrada.")) {
    this.worker.terminate();
    for (const request of this.requests.values()) request.reject(reason);
    this.requests.clear();
  }
}
