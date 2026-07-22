import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/lib/auth-context";
import { CepSearch } from "./cep-search";

function renderCepSearch(onSelect = vi.fn()) {
  render(
    <AuthProvider>
      <CepSearch label="Origem" onSelect={onSelect} />
    </AuthProvider>,
  );
  return { onSelect };
}

describe("CepSearch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("busca endereços e chama onSelect ao clicar num resultado", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve([
            {
              cep: "01310-100",
              logradouro: "Av. Paulista",
              complemento: "",
              bairro: "Bela Vista",
              localidade: "São Paulo",
              uf: "SP",
            },
          ]),
      }),
    );

    const { onSelect } = renderCepSearch();

    await user.click(screen.getByRole("button", { name: /buscar cep/i }));
    await user.type(screen.getByPlaceholderText("UF"), "SP");
    await user.type(screen.getByPlaceholderText("Cidade"), "São Paulo");
    await user.type(screen.getByPlaceholderText("Logradouro"), "Paulista");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    const resultButton = await screen.findByText(/01310-100/);
    await user.click(resultButton);

    expect(onSelect).toHaveBeenCalledWith("01310-100");
  });

  it("mostra mensagem de erro quando nenhum CEP é encontrado", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: () => Promise.resolve([]),
      }),
    );

    renderCepSearch();

    await user.click(screen.getByRole("button", { name: /buscar cep/i }));
    await user.type(screen.getByPlaceholderText("UF"), "SP");
    await user.type(screen.getByPlaceholderText("Cidade"), "Nenhuma");
    await user.type(screen.getByPlaceholderText("Logradouro"), "Rua X");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    await waitFor(() => {
      expect(
        screen.getByText("Nenhum CEP encontrado para esse endereço"),
      ).toBeInTheDocument();
    });
  });
});
