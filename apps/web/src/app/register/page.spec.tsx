import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthResult, useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api-client";
import RegisterPage from "./page";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

function mockAuth(
  register: (params: {
    tenantName: string;
    tenantSlug: string;
    name: string;
    email: string;
    password: string;
  }) => Promise<AuthResult>,
) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    accessToken: null,
    login: vi.fn(),
    register,
    verifyMfa: vi.fn(),
    exchangeOAuthCode: vi.fn(),
    setupMfa: vi.fn(),
    enableMfa: vi.fn(),
    disableMfa: vi.fn(),
    logout: vi.fn(),
  });
}

describe("RegisterPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("cria a conta e redireciona para a nova cotação", async () => {
    const register = vi.fn().mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: {
        id: "user-1",
        tenantId: "tenant-1",
        name: "Ana",
        email: "ana@example.com",
        role: "OWNER",
        mfaEnabled: false,
      },
    });
    mockAuth(register);

    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByLabelText("Nome da empresa"), "Acme Ltda");
    await user.type(screen.getByLabelText("Seu nome"), "Ana");
    await user.type(screen.getByLabelText("E-mail"), "ana@example.com");
    await user.type(screen.getByLabelText("Senha"), "supersecret123");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(register).toHaveBeenCalledWith({
      tenantName: "Acme Ltda",
      tenantSlug: "acme-ltda",
      name: "Ana",
      email: "ana@example.com",
      password: "supersecret123",
    });
    expect(pushMock).toHaveBeenCalledWith("/freight-quotes/new");
  });

  it("permite editar o identificador do tenant manualmente", async () => {
    const register = vi.fn().mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: {
        id: "user-1",
        tenantId: "tenant-1",
        name: "Ana",
        email: "ana@example.com",
        role: "OWNER",
        mfaEnabled: false,
      },
    });
    mockAuth(register);

    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByLabelText("Nome da empresa"), "Acme Ltda");
    const slugInput = screen.getByLabelText("Identificador do tenant");
    await user.clear(slugInput);
    await user.type(slugInput, "acme-custom");
    await user.type(screen.getByLabelText("Seu nome"), "Ana");
    await user.type(screen.getByLabelText("E-mail"), "ana@example.com");
    await user.type(screen.getByLabelText("Senha"), "supersecret123");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ tenantSlug: "acme-custom" }),
    );
  });

  it("mostra a mensagem de erro da API quando o registro falha", async () => {
    const register = vi
      .fn()
      .mockRejectedValue(
        new ApiError("Este identificador de tenant já está em uso", 409),
      );
    mockAuth(register);

    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByLabelText("Nome da empresa"), "Acme Ltda");
    await user.type(screen.getByLabelText("Seu nome"), "Ana");
    await user.type(screen.getByLabelText("E-mail"), "ana@example.com");
    await user.type(screen.getByLabelText("Senha"), "supersecret123");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(
      await screen.findByText("Este identificador de tenant já está em uso"),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
