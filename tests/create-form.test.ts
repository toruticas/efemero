import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  hooks: [] as unknown[],
  cursor: 0,
  api: vi.fn(),
  upload: vi.fn(),
  run: vi.fn(),
  close: vi.fn(),
}));

// Keep hook values between explicit renders so the real component's callbacks
// can be exercised in the node test environment without a browser renderer.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState(initial: unknown) {
    const index = mocks.cursor++;
    if (index === mocks.hooks.length) mocks.hooks.push(initial);
    return [
      mocks.hooks[index],
      (value: unknown) => {
        mocks.hooks[index] =
          typeof value === "function" ? value(mocks.hooks[index]) : value;
      },
    ];
  },
  useRef(initial: unknown) {
    const index = mocks.cursor++;
    if (index === mocks.hooks.length) mocks.hooks.push({ current: initial });
    return mocks.hooks[index];
  },
}));
vi.mock("@/components/i18n-provider", () => ({
  useI18n: () => ({ t: (message: string) => message, locale: "en" }),
}));
vi.mock("@/lib/api", () => ({ api: mocks.api }));
vi.mock("@vercel/blob/client", () => ({ upload: mocks.upload }));
vi.mock("@/lib/crypto-session", () => ({
  CryptoSession: class {
    run = mocks.run;
    close = mocks.close;
  },
}));

import { CreateForm } from "@/components/create-form";

type Element = ReactElement<Record<string, unknown>>;

function find(
  node: ReactNode,
  predicate: (element: Element) => boolean,
): Element {
  const nodes = Array.isArray(node) ? node : [node];
  for (const child of nodes) {
    if (!isValidElement<Record<string, unknown>>(child)) continue;
    if (predicate(child)) return child;
    const found = findOrNull(child.props.children as ReactNode, predicate);
    if (found) return found;
  }
  throw new Error("Expected form element was not rendered");
}

function findOrNull(
  node: ReactNode,
  predicate: (element: Element) => boolean,
): Element | null {
  try {
    return find(node, predicate);
  } catch {
    return null;
  }
}

function change(tree: ReactNode, id: string, target: object) {
  const input = find(tree, (element) => element.props.id === id);
  (input.props.onChange as (event: { target: object }) => void)({ target });
}

function click(element: Element) {
  (element.props.onClick as () => void)();
}

function submit(tree: ReactNode) {
  const form = find(tree, (element) => element.type === "form");
  return (form.props.onSubmit as (event: object) => Promise<void>)({
    preventDefault: vi.fn(),
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("artifact creation form", () => {
  const password = "a long recipient password";
  const onCreated = vi.fn();
  const reservation = {
    id: "artifact-id",
    namespace: "a",
    slug: "artifact-slug",
    managementToken: "management-credential",
    registrationResponse: "response",
    serverIdentity: "server",
    pathname: "artifacts/artifact-id/payload.bin",
    expiresAt: "2030-01-01T00:00:00Z",
  };

  function render() {
    mocks.cursor = 0;
    return CreateForm({ configured: true, onCreated });
  }

  function selectFile(arrayBuffer: () => Promise<ArrayBuffer>) {
    let tree = render();
    click(
      find(
        tree,
        (element) =>
          element.props.role === "tab" &&
          Array.isArray(element.props.children) &&
          element.props.children.includes("File"),
      ),
    );
    tree = render();
    change(tree, "password", { value: password });
    change(tree, "artifact-file", {
      files: [{ name: "secret.txt", type: "text/plain", size: 3, arrayBuffer }],
    });
    return render();
  }

  function expectPublishedOnce() {
    expect(
      mocks.api.mock.calls.filter(
        ([path]) => path === "/api/artifacts/reserve",
      ),
    ).toHaveLength(1);
    expect(
      mocks.api.mock.calls.filter(([path]) => path === "/api/artifacts/commit"),
    ).toHaveLength(1);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledTimes(1);
  }

  beforeEach(() => {
    mocks.hooks = [];
    mocks.cursor = 0;
    vi.resetAllMocks();
    vi.stubGlobal("location", { origin: "https://example.test" });
    mocks.api.mockImplementation(async (path: string) => {
      if (path === "/api/artifacts/reserve") return reservation;
    });
    mocks.run.mockImplementation(async (action: string) => {
      if (action === "register-start")
        return { registrationRequest: "registration-request" };
      return {
        ciphertext: new ArrayBuffer(3),
        wrappedKey: { version: 1, nonce: "nonce", ciphertext: "wrapped-key" },
        registrationRecord: "registration-record",
      };
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("disables the form and submits only once while a file read is pending", async () => {
    const read = deferred<ArrayBuffer>();
    const arrayBuffer = vi.fn(() => read.promise);
    const tree = selectFile(arrayBuffer);
    const first = submit(tree);

    const pending = render();
    for (const id of ["artifact-file", "password", "ttl", "views"])
      expect(
        find(pending, (element) => element.props.id === id).props.disabled,
      ).toBe(true);
    expect(
      find(pending, (element) => element.props.type === "submit").props
        .disabled,
    ).toBe(true);
    // A second event must be rejected even before a React render can occur.
    await submit(tree);
    await submit(pending);
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
    expect(mocks.api).not.toHaveBeenCalled();

    read.resolve(new ArrayBuffer(3));
    await first;
    expectPublishedOnce();
    expect(mocks.close).toHaveBeenCalledTimes(1);
    const result = render();
    expect(
      find(result, (element) => element.props["aria-label"] === "Artifact link")
        .props.value,
    ).toBe("https://example.test/a/artifact-slug");
    expect(
      find(result, (element) => element.props.id === "created-password").props
        .value,
    ).toBe(password);

    click(
      find(result, (element) => element.props.className === "button primary"),
    );
    await submit(selectFile(vi.fn().mockResolvedValue(new ArrayBuffer(3))));
    expect(onCreated).toHaveBeenCalledTimes(2);
    expect(
      mocks.api.mock.calls.filter(
        ([path]) => path === "/api/artifacts/reserve",
      ),
    ).toHaveLength(2);
  });

  it("allows retry after a file read fails", async () => {
    const read = deferred<ArrayBuffer>();
    const arrayBuffer = vi
      .fn<() => Promise<ArrayBuffer>>()
      .mockReturnValueOnce(read.promise)
      .mockResolvedValue(new ArrayBuffer(3));
    const tree = selectFile(arrayBuffer);
    const first = submit(tree);
    await submit(tree);
    read.reject(new Error("Could not read this file"));
    await first;

    const failed = render();
    expect(
      find(failed, (element) => element.props.role === "alert").props.children,
    ).toBe("Could not complete the operation. Try again.");
    expect(
      find(failed, (element) => element.props.type === "submit").props.disabled,
    ).toBe(false);
    expect(mocks.api).not.toHaveBeenCalled();
    await submit(failed);
    expect(arrayBuffer).toHaveBeenCalledTimes(2);
    expectPublishedOnce();
  });

  it("allows retry after validation fails before reading the file", async () => {
    const arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(3));
    const tree = selectFile(arrayBuffer);
    change(tree, "password", { value: "too short" });
    await submit(render());
    expect(arrayBuffer).not.toHaveBeenCalled();
    const failed = render();
    expect(
      find(failed, (element) => element.props.type === "submit").props.disabled,
    ).toBe(false);
    change(failed, "password", { value: password });
    await submit(render());
    expectPublishedOnce();
  });

  it("allows retry after publication fails and cleans up the reservation", async () => {
    let failCommit = true;
    mocks.api.mockImplementation(async (path: string) => {
      if (path === "/api/artifacts/reserve") return reservation;
      if (path === "/api/artifacts/commit" && failCommit) {
        failCommit = false;
        throw new Error("Could not publish this artifact");
      }
    });
    const tree = selectFile(vi.fn().mockResolvedValue(new ArrayBuffer(3)));
    await submit(tree);
    expect(mocks.api).toHaveBeenCalledWith("/api/artifacts/revoke", {
      id: reservation.id,
      managementToken: reservation.managementToken,
    });
    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(onCreated).not.toHaveBeenCalled();

    const failed = render();
    expect(
      find(failed, (element) => element.props.type === "submit").props.disabled,
    ).toBe(false);
    change(failed, "password", { value: password });
    await submit(render());
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(mocks.close).toHaveBeenCalledTimes(2);
    expect(
      find(render(), (element) => element.props.id === "created-password").props
        .value,
    ).toBe(password);
  });
});
