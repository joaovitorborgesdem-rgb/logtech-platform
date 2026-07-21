"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { CepSearch } from "@/components/cep-search";
import { cmToMeters, kgToTons, metersToCm, tonsToKg } from "@/lib/units";

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
}

export default function NewFreightQuotePage() {
  const { user, accessToken } = useAuth();
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

  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
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
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            CEP de origem
          </label>
          <input
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
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            CEP de destino
          </label>
          <input
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
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Peso (toneladas)
            </label>
            <input
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
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Comprimento (m)
            </label>
            <input
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
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Largura (m)
            </label>
            <input
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
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Altura (m)
            </label>
            <input
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
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Valor da carga (R$)
          </label>
          <input
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
        </div>
      )}
    </div>
  );
}
