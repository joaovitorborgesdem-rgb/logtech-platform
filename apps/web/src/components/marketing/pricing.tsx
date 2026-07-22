import Link from "next/link";

const TIERS = [
  {
    name: "Starter",
    price: "Grátis",
    description: "Para validar a operação com um único usuário.",
    features: ["1 usuário", "Até 50 cotações/mês", "Dashboard básico"],
    highlighted: false,
  },
  {
    name: "Pro",
    price: "R$ 299/mês",
    description: "Para operações em crescimento com equipe.",
    features: [
      "Usuários ilimitados",
      "Cotações ilimitadas",
      "Insights e exportação CSV/PDF",
      "Webhooks e integrações",
    ],
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Sob consulta",
    description: "Para operações com requisitos dedicados.",
    features: [
      "Tudo do plano Pro",
      "SLA dedicado",
      "Observabilidade e auditoria avançada",
    ],
    highlighted: false,
  },
];

export function Pricing() {
  return (
    <section
      id="pricing"
      className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20"
    >
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
          Planos para cada estágio da operação
        </h2>
        <p className="mt-4 text-zinc-600 dark:text-zinc-400">
          Comece grátis e evolua conforme sua operação cresce.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-3">
        {TIERS.map((tier) => (
          <div
            key={tier.name}
            className={`flex flex-col rounded-lg border p-6 ${
              tier.highlighted
                ? "border-zinc-900 dark:border-zinc-50"
                : "border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <h3 className="font-medium text-zinc-900 dark:text-zinc-50">
              {tier.name}
            </h3>
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              {tier.price}
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {tier.description}
            </p>
            <ul className="mt-6 flex flex-1 flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              {tier.features.map((feature) => (
                <li key={feature}>· {feature}</li>
              ))}
            </ul>
            <Link
              href="/login"
              className={`mt-6 rounded-md px-4 py-2 text-center text-sm font-medium transition-colors ${
                tier.highlighted
                  ? "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
                  : "border border-zinc-300 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
              }`}
            >
              Começar agora
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
