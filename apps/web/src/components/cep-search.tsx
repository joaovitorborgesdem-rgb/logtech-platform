"use client";

import { KeyboardEvent, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

interface ViaCepAddress {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
}

interface CepSearchProps {
  label: string;
  onSelect: (cep: string) => void;
}

export function CepSearch({ label, onSelect }: CepSearchProps) {
  const { accessToken } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [uf, setUf] = useState("");
  const [city, setCity] = useState("");
  const [street, setStreet] = useState("");
  const [results, setResults] = useState<ViaCepAddress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  async function handleSearch() {
    setError(null);
    setIsSearching(true);
    setResults([]);

    try {
      const addresses = await apiFetch<ViaCepAddress[]>(
        "/integrations/viacep/search",
        { token: accessToken, query: { uf, city, street } },
      );
      setResults(addresses);
      if (addresses.length === 0) {
        setError("Nenhum CEP encontrado para esse endereço");
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao buscar o CEP",
      );
    } finally {
      setIsSearching(false);
    }
  }

  function handleFieldKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void handleSearch();
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="text-sm font-medium text-blue-600 underline dark:text-blue-400"
      >
        {isOpen ? "Fechar busca de CEP" : `Buscar CEP (${label})`}
      </button>

      {isOpen && (
        <div className="mt-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
          {/* Not a <form>: this widget lives inside the freight-quote page's
              own <form>, and nested <form> elements are invalid HTML. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <input
              type="text"
              placeholder="UF"
              maxLength={2}
              value={uf}
              onChange={(event) => setUf(event.target.value.toUpperCase())}
              onKeyDown={handleFieldKeyDown}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm uppercase dark:border-zinc-700 dark:bg-zinc-900"
            />
            <input
              type="text"
              placeholder="Cidade"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              onKeyDown={handleFieldKeyDown}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 sm:col-span-1"
            />
            <input
              type="text"
              placeholder="Logradouro"
              value={street}
              onChange={(event) => setStreet(event.target.value)}
              onKeyDown={handleFieldKeyDown}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 sm:col-span-1"
            />
            <button
              type="button"
              disabled={isSearching || !uf || !city || !street}
              onClick={() => void handleSearch()}
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
            >
              {isSearching ? "Buscando..." : "Buscar"}
            </button>
          </div>

          {error && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {results.length > 0 && (
            <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
              {results.map((address) => (
                <li key={address.cep}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(address.cep);
                      setIsOpen(false);
                    }}
                    className="w-full py-2 text-left text-sm hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    <span className="font-medium">{address.cep}</span> —{" "}
                    {address.logradouro}, {address.bairro},{" "}
                    {address.localidade}/{address.uf}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
