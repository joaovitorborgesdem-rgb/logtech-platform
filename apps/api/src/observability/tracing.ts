import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

/**
 * Bootstrap do OpenTelemetry — precisa rodar antes de qualquer outro import
 * que acabe carregando módulos instrumentados (http, express...), por isso é
 * a primeira linha de `main.ts` (ver ADR-013). Sem `OTEL_EXPORTER_OTLP_ENDPOINT`
 * configurado, os spans só são impressos no console (`ConsoleSpanExporter`) —
 * útil em dev para ver que o tracing está funcionando sem precisar subir um
 * collector; em produção, configurar a env var para exportar a um collector
 * OTLP real (Jaeger, Tempo, Honeycomb, etc.).
 */
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "logisense-api",
  }),
  traceExporter: otlpEndpoint
    ? new OTLPTraceExporter({ url: otlpEndpoint })
    : new ConsoleSpanExporter(),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

process.on("SIGTERM", () => {
  void sdk.shutdown().finally(() => process.exit(0));
});
