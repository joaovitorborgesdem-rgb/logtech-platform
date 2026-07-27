import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginOutcome, useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api-client";
import LoginPage from "./page";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

function mockAuth(
  login: (params: {
    tenantSlug: string;
    email: string;
    password: string;
  }) => Promise<LoginOutcome>,
) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    accessToken: null,
    login,
    verifyMfa: vi.fn(),
    exchangeOAuthCode: vi.fn(),
    setupMfa: vi.fn(),
    enableMfa: vi.fn(),
    disableMfa: vi.fn(),
    logout: vi.fn(),
  });
}

describe("LoginPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("faz login com sucesso e redireciona para a nova cotação", async () => {
    const login = vi.fn().mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: {
        id: "user-1",
        tenantId: "tenant-1",
        name: "Owner",
        email: "owner@example.com",
        role: "OWNER",
        mfaEnabled: false,
      },
    });
    mockAuth(login);

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(
      screen.getByLabelText("Identificador do tenant"),
      "acme",
    );
    await user.type(screen.getByLabelText("E-mail"), "owner@example.com");
    await user.type(screen.getByLabelText("Senha"), "supersecret123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(login).toHaveBeenCalledWith({
      tenantSlug: "acme",
      email: "owner@example.com",
      password: "supersecret123",
    });
    expect(pushMock).toHaveBeenCalledWith("/freight-quotes/new");
  });

  it("redireciona para verificação de MFA quando exigido", async () => {
    const login = vi.fn().mockResolvedValue({
      mfaRequired: true,
      mfaToken: "mfa-token-123",
    });
    mockAuth(login);

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(
      screen.getByLabelText("Identificador do tenant"),
      "acme",
    );
    await user.type(screen.getByLabelText("E-mail"), "owner@example.com");
    await user.type(screen.getByLabelText("Senha"), "supersecret123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(pushMock).toHaveBeenCalledWith(
      "/mfa/verify?mfaToken=mfa-token-123",
    );
  });

  it("mostra a mensagem de erro da API quando o login falha", async () => {
    const login = vi
      .fn()
      .mockRejectedValue(new ApiError("Credenciais inválidas", 401));
    mockAuth(login);

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(
      screen.getByLabelText("Identificador do tenant"),
      "acme",
    );
    await user.type(screen.getByLabelText("E-mail"), "owner@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha-errada");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(
      await screen.findByText("Credenciais inválidas"),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
