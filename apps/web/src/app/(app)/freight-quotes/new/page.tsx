"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  ApiError,
  apiFetch,
  SESSION_EXPIRED_MESSAGE,
} from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { CepSearch } from "@/components/cep-search";
import { createRealtimeSocket } from "@/lib/realtime-socket";
import { cmToMeters, kgToTons, metersToCm, tonsToKg } from "@/lib/units";

interface FreightQuoteOption {
  id: string;
  carrierId: string;
  carrier: { id: string; name: string };
  price: string;
  estimatedDays: number | null;
}

interface FreightQuote {
  id: string;
  originZipCode: string;
  destinationZipCode: string;
  weightKg: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  cargoValue: string;
  status: string;
  options: FreightQuoteOption[];
}

const HTTP_UNAUTHORIZED = 401;
const QUOTE_STATUS_TIMEOUT_MS = 20_000;
const QUOTE_STATUS_TIMEOUT_MESSAGE =
  "Não foi possível confirmar o status da cotação. Tente novamente.";

export default function NewFreightQuotePage() {
  const { user, accessToken, initialized } = useAuth();
  const router = useRouter();

  const [originZipCode, setOriginZipCode] = useState("");
  const [destinationZipCode, setDestinationZipCode] = useState("");
  const [weightTons, setWeightTons] = useState("");
  const [lengthM, setLengthM] = useState("");
  const [widthM, setWidthM] = useState("");
  const [heightM, setHeightM] = useState("");
  const [cargoValue, setCargoValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdQuote, setCreatedQuote] = useState<FreightQuote | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    if (initialized && !user) {
      router.push("/login");
    }
  }, [initialized, user, router]);

  useEffect(() => {
    if (!createdQuote || !accessToken) {
      return;
    }

    const quoteId = createdQuote.id;
    let cancelled = false;
    let settled = false;

    function markSettled() {
      settled = true;
    }

    function handleUnrecoverable(message: string) {
      if (cancelled) return;
      markSettled();
      setStatusError(message);
    }

    // The calculation worker can finish (and emit "freight-quote.updated")
    // before the socket below finishes its handshake + tenant-room join —
    // Socket.IO does not buffer room events for late joiners, so that
    // update would otherwise be lost forever. Reconcile with a direct fetch
    // in parallel so a fast worker can never leave this screen stuck.
    apiFetch<FreightQuote>(`/freight-quotes/${quoteId}`, {
      token: accessToken,
    })
      .then((quote) => {
        if (!cancelled) {
          markSettled();
          setCreatedQuote(quote);
        }
      })
      .catch((err) => {
        // An auth failure here is unrecoverable for this screen even if the
        // WebSocket below still connects fine with the same stale token —
        // surface it instead of relying solely on the timeout fallback.
        if (err instanceof ApiError && err.status === HTTP_UNAUTHORIZED) {
          handleUnrecoverable(err.message);
        }
      });

    const socket = createRealtimeSocket(accessToken);
    socket.on("freight-quote.updated", (updated: FreightQuote) => {
      if (updated.id === quoteId) {
        markSettled();
        setCreatedQuote(updated);
      }
    });
    socket.on("error", (payload: { message?: string }) => {
      handleUnrecoverable(payload?.message ?? QUOTE_STATUS_TIMEOUT_MESSAGE);
    });

    // Last-resort safety net: if neither the reconciliation fetch nor the
    // socket ever resolves the status (e.g. both silently fail the same way
    // for a reason we didn't anticipate), don't leave the screen spinning
    // forever — surface something actionable after a bounded wait.
    const timeoutId = setTimeout(() => {
      if (!cancelled && !settled) {
        setStatusError(QUOTE_STATUS_TIMEOUT_MESSAGE);
      }
    }, QUOTE_STATUS_TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createdQuote?.id, accessToken]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatusError(null);
    setIsSubmitting(true);

    try {
      const quote = await apiFetch<FreightQuote>("/freight-quotes", {
        method: "POST",
        token: accessToken,
        body: {
          originZipCode,
          destinationZipCode,
          weightKg: tonsToKg(Number(weightTons)),
          lengthCm: metersToCm(Number(lengthM)),
          widthCm: metersToCm(Number(widthM)),
          heightCm: metersToCm(Number(heightM)),
          cargoValue: Number(cargoValue),
        },
      });
      setCreatedQuote(quote);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Falha ao simular a cotação de frete",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!user) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Simular cotação de frete
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section>
          <label
            htmlFor="originZipCode"
            className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            CEP de origem
          </label>
          <input
            id="originZipCode"
            type="text"
            required
            placeholder="00000-000"
            value={originZipCode}
            onChange={(event) => setOriginZipCode(event.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <CepSearch label="origem" onSelect={setOriginZipCode} />
        </section>

        <section>
          <label
            htmlFor="destinationZipCode"
            className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            CEP de destino
          </label>
          <input
            id="destinationZipCode"
            type="text"
            required
            placeholder="00000-000"
            value={destinationZipCode}
            onChange={(event) => setDestinationZipCode(event.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <CepSearch label="destino" onSelect={setDestinationZipCode} />
        </section>

        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <label
              htmlFor="weightTons"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Peso (toneladas)
            </label>
            <input
              id="weightTons"
              type="number"
              step="any"
              min="0"
              required
              value={weightTons}
              onChange={(event) => setWeightTons(event.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div>
            <label
              htmlFor="lengthM"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Comprimento (m)
            </label>
            <input
              id="lengthM"
              type="number"
              step="any"
              min="0"
              required
              value={lengthM}
              onChange={(event) => setLengthM(event.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div>
            <label
              htmlFor="widthM"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Largura (m)
            </label>
            <input
              id="widthM"
              type="number"
              step="any"
              min="0"
              required
              value={widthM}
              onChange={(event) => setWidthM(event.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div>
            <label
              htmlFor="heightM"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Altura (m)
            </label>
            <input
              id="heightM"
              type="number"
              step="any"
              min="0"
              required
              value={heightM}
              onChange={(event) => setHeightM(event.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
        </section>

        <section>
          <label
            htmlFor="cargoValue"
            className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Valor da carga (R$)
          </label>
          <input
            id="cargoValue"
            type="number"
            step="any"
            min="0"
            required
            value={cargoValue}
            onChange={(event) => setCargoValue(event.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </section>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {isSubmitting ? "Enviando..." : "Simular frete"}
        </button>
      </form>

      {createdQuote && (
        <div className="mt-8 rounded-md border border-green-300 bg-green-50 p-4 text-sm dark:border-green-800 dark:bg-green-950">
          <p className="mb-2 font-medium text-green-800 dark:text-green-200">
            Cotação #{createdQuote.id} criada com status {createdQuote.status}
          </p>
          <ul className="space-y-1 text-green-800 dark:text-green-200">
            <li>
              Peso: {kgToTons(Number(createdQuote.weightKg)).toFixed(3)} t
            </li>
            <li>
              Dimensões: {cmToMeters(Number(createdQuote.lengthCm)).toFixed(2)}{" "}
              x {cmToMeters(Number(createdQuote.widthCm)).toFixed(2)} x{" "}
              {cmToMeters(Number(createdQuote.heightCm)).toFixed(2)} m
            </li>
            <li>Origem → Destino: {createdQuote.originZipCode} → {createdQuote.destinationZipCode}</li>
          </ul>

          {(createdQuote.status === "PENDING" ||
            createdQuote.status === "PROCESSING") &&
            (statusError ? (
              <div className="mt-4 text-red-700 dark:text-red-300">
                <p>{statusError}</p>
                {statusError === SESSION_EXPIRED_MESSAGE && (
                  <a href="/login" className="font-medium underline">
                    Fazer login novamente
                  </a>
                )}
              </div>
            ) : (
              <p className="mt-4">
                Calculando opções de frete em tempo real…
              </p>
            ))}

          {createdQuote.status === "ERROR" && (
            <p className="mt-4 text-red-700 dark:text-red-300">
              Falha ao calcular as opções de frete. Tente novamente.
            </p>
          )}

          {createdQuote.options.length > 0 ? (
            <table className="mt-4 w-full text-left text-sm text-green-900 dark:text-green-100">
              <thead>
                <tr className="border-b border-green-300 dark:border-green-800">
                  <th className="py-1 pr-4 font-medium">Transportadora</th>
                  <th className="py-1 pr-4 font-medium">Preço</th>
                  <th className="py-1 font-medium">Prazo estimado</th>
                </tr>
              </thead>
              <tbody>
                {createdQuote.options.map((option) => (
                  <tr key={option.id} className="border-b border-green-200 dark:border-green-900">
                    <td className="py-1 pr-4">{option.carrier.name}</td>
                    <td className="py-1 pr-4">
                      {Number(option.price).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </td>
                    <td className="py-1">
                      {option.estimatedDays ?? "—"}{" "}
                      {option.estimatedDays === 1 ? "dia útil" : "dias úteis"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            createdQuote.status === "DONE" && (
              <p className="mt-4">
                Nenhuma transportadora ativa encontrada para calcular opções.
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}
