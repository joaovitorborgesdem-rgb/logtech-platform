import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactForm } from "./contact-form";

describe("ContactForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envia os dados do formulário e mostra a mensagem de sucesso", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: () => Promise.resolve({ id: "lead-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ContactForm />);

    await user.type(screen.getByLabelText("Nome"), "Fulano de Tal");
    await user.type(screen.getByLabelText("E-mail"), "fulano@example.com");
    await user.type(screen.getByLabelText("Empresa (opcional)"), "Acme");
    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    expect(
      await screen.findByText(
        "Obrigado! Recebemos seu contato e vamos responder em breve.",
      ),
    ).toBeInTheDocument();

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({
      name: "Fulano de Tal",
      email: "fulano@example.com",
      company: "Acme",
    });
  });

  it("mostra mensagem de erro quando a API falha", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 500,
        ok: false,
        json: () => Promise.resolve({ message: "Erro ao registrar contato" }),
      }),
    );

    const user = userEvent.setup();
    render(<ContactForm />);

    await user.type(screen.getByLabelText("Nome"), "Fulano de Tal");
    await user.type(screen.getByLabelText("E-mail"), "fulano@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    expect(
      await screen.findByText("Erro ao registrar contato"),
    ).toBeInTheDocument();
  });
});
