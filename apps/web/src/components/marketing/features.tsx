const FEATURES = [
  {
    title: "Cotação de frete automatizada",
    description:
      "Calcule opções de frete por transportadora em segundos, com processamento assíncrono e atualização em tempo real via WebSocket.",
  },
  {
    title: "Multi-tenant por design",
    description:
      "Cada cliente opera isolado dos demais — dados, usuários e filas segregados automaticamente em toda a stack.",
  },
  {
    title: "Dashboard operacional",
    description:
      "Métricas de frete, transportadoras e clientes com cache em Redis para respostas rápidas mesmo sob carga.",
  },
  {
    title: "Insights e analytics",
    description:
      "Agregações diárias, tendências por transportadora e exportação em CSV/PDF para análise fora da plataforma.",
  },
  {
    title: "Auditoria automática",
    description:
      "Toda mutação relevante é registrada automaticamente, com consulta filtrável por ação, usuário e período.",
  },
  {
    title: "Observabilidade",
    description:
      "Logs estruturados, métricas Prometheus, tracing distribuído e alertas de erro/latência prontos para produção.",
  },
];

export function Features() {
  return (
    <section
      id="features"
      className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20"
    >
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
          Tudo que sua operação logística precisa
        </h2>
        <p className="mt-4 text-zinc-600 dark:text-zinc-400">
          Recursos construídos para operações reais, não uma maquete.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800"
          >
            <h3 className="font-medium text-zinc-900 dark:text-zinc-50">
              {feature.title}
            </h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {feature.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
