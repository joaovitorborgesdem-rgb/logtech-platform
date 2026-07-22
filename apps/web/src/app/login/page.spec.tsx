import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api-client";
import LoginPage from "./page";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

describe("LoginPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("faz login com sucesso e redireciona para a nova cotação", async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      accessToken: null,
      login,
      logout: vi.fn(),
    });

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

  it("mostra a mensagem de erro da API quando o login falha", async () => {
    const login = vi.fn().mockRejectedValue(new ApiError("Credenciais inválidas", 401));
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      accessToken: null,
      login,
      logout: vi.fn(),
    });

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(
      screen.getByLabelText("Identificador do tenant"),
      "acme",
    );
    await user.type(screen.getByLabelText("E-mail"), "owner@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha-errada");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Credenciais inválidas")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
