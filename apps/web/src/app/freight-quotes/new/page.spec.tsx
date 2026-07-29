import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/lib/auth-context";
import NewFreightQuotePage from "./page";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

interface FakeSocket {
  on: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  emit(event: string, payload?: unknown): void;
}

let lastSocket: FakeSocket | undefined;

vi.mock("@/lib/realtime-socket", () => ({
  createRealtimeSocket: vi.fn(() => {
    const handlers = new Map<string, (payload?: unknown) => void>();
    const socket: FakeSocket = {
      on: vi.fn((event: string, handler: (payload?: unknown) => void) => {
        handlers.set(event, handler);
      }),
      disconnect: vi.fn(),
      emit(event, payload) {
        handlers.get(event)?.(payload);
      },
    };
    lastSocket = socket;
    return socket;
  }),
}));

const quoteResponseBody = {
  id: "quote-1",
  originZipCode: "01310-100",
  destinationZipCode: "20040-020",
  weightKg: "1000",
  lengthCm: "100",
  widthCm: "100",
  heightCm: "100",
  cargoValue: "5000",
  status: "PENDING",
  options: [],
};

function mockAuth() {
  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: "user-1",
      tenantId: "tenant-1",
      name: "Ana",
      email: "ana@example.com",
      role: "OWNER",
      mfaEnabled: false,
    },
    accessToken: "access-token",
    initialized: true,
    login: vi.fn(),
    register: vi.fn(),
    verifyMfa: vi.fn(),
    exchangeOAuthCode: vi.fn(),
    setupMfa: vi.fn(),
    enableMfa: vi.fn(),
    disableMfa: vi.fn(),
    logout: vi.fn(),
  });
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("CEP de origem"), "01310-100");
  await user.type(screen.getByLabelText("CEP de destino"), "20040-020");
  await user.type(screen.getByLabelText("Peso (toneladas)"), "1");
  await user.type(screen.getByLabelText("Comprimento (m)"), "1");
  await user.type(screen.getByLabelText("Largura (m)"), "1");
  await user.type(screen.getByLabelText("Altura (m)"), "1");
  await user.type(screen.getByLabelText("Valor da carga (R$)"), "5000");
  await user.click(screen.getByRole("button", { name: "Simular frete" }));
}

describe("NewFreightQuotePage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    lastSocket = undefined;
  });

  it("mostra sessão expirada quando a criação da cotação falha com 401 irrecuperável", async () => {
    mockAuth();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/auth/refresh")) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: "Refresh token inválido" }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ message: "Unauthorized" }),
        });
      }),
    );

    const user = userEvent.setup();
    render(<NewFreightQuotePage />);
    await fillAndSubmit(user);

    expect(
      await screen.findByText("Sua sessão expirou. Faça login novamente."),
    ).toBeInTheDocument();
  });

  it("mostra sessão expirada (com link de login) quando a checagem de status falha com 401", async () => {
    mockAuth();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url.endsWith("/freight-quotes") && init?.method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 201,
            json: () => Promise.resolve(quoteResponseBody),
          });
        }
        if (url.includes("/freight-quotes/quote-1")) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: "Unauthorized" }),
          });
        }
        if (url.includes("/auth/refresh")) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ message: "Refresh token inválido" }),
          });
        }
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
    );

    const user = userEvent.setup();
    render(<NewFreightQuotePage />);
    await fillAndSubmit(user);

    expect(
      await screen.findByText("Sua sessão expirou. Faça login novamente."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Fazer login novamente" }),
    ).toHaveAttribute("href", "/login");
    expect(
      screen.queryByText("Calculando opções de frete em tempo real…"),
    ).not.toBeInTheDocument();
  });

  it("mostra a mensagem de erro do gateway quando o WebSocket rejeita a autenticação", async () => {
    mockAuth();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url.endsWith("/freight-quotes") && init?.method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 201,
            json: () => Promise.resolve(quoteResponseBody),
          });
        }
        if (url.includes("/freight-quotes/quote-1")) {
          // Never resolves before the socket "error" event fires below.
          return new Promise(() => undefined);
        }
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
    );

    const user = userEvent.setup();
    render(<NewFreightQuotePage />);
    await fillAndSubmit(user);

    await waitFor(() => expect(lastSocket).toBeDefined());
    lastSocket?.emit("error", { message: "Token de autenticação inválido" });

    expect(
      await screen.findByText("Token de autenticação inválido"),
    ).toBeInTheDocument();
  });

  it("mostra timeout quando nada confirma o status a tempo", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockAuth();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url.endsWith("/freight-quotes") && init?.method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 201,
            json: () => Promise.resolve(quoteResponseBody),
          });
        }
        // Reconciliation GET never settles either.
        return new Promise(() => undefined);
      }),
    );

    const user = userEvent.setup({
      advanceTimers: (ms) => vi.advanceTimersByTime(ms),
    });
    render(<NewFreightQuotePage />);
    await fillAndSubmit(user);

    await screen.findByText("Calculando opções de frete em tempo real…");

    await vi.advanceTimersByTimeAsync(20_000);

    expect(
      await screen.findByText(
        "Não foi possível confirmar o status da cotação. Tente novamente.",
      ),
    ).toBeInTheDocument();
  });
});
