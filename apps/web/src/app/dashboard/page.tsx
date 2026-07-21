"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

interface DashboardMetrics {
  totalFreightQuotes: number;
  freightQuotesByStatus: {
    PENDING: number;
    PROCESSING: number;
    DONE: number;
    ERROR: number;
  };
  avgFreightPrice: number | null;
  totalActiveCarriers: number;
  totalActiveClients: number;
  errorRate: number;
  freightQuotesLast7Days: { date: string; count: number }[];
  generatedAt: string;
}

const REFRESH_INTERVAL_MS = 30_000;

const STATUS_META: {
  key: keyof DashboardMetrics["freightQuotesByStatus"];
  label: string;
  cssVar: string;
}[] = [
  { key: "DONE", label: "Concluída", cssVar: "--status-good" },
  { key: "PROCESSING", label: "Processando", cssVar: "--status-warning" },
  { key: "PENDING", label: "Pendente", cssVar: "--status-neutral" },
  { key: "ERROR", label: "Erro", cssVar: "--status-critical" },
];

const BAR_CHART_WIDTH = 560;
const BAR_HEIGHT = 20;
const BAR_GAP = 22;
const BAR_LABEL_WIDTH = 110;

function roundedEndBarPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): string {
  const w = Math.max(width, 0);
  const r = Math.min(radius, height / 2, w || radius);
  if (w <= 0) {
    return "";
  }
  return `M ${x} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${
    y + height - r
  } A ${r} ${r} 0 0 1 ${x + w - r} ${y + height} H ${x} Z`;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatShortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
    </div>
  );
}

function StatusBreakdownChart({
  metrics,
}: {
  metrics: DashboardMetrics["freightQuotesByStatus"];
}) {
  const maxValue = Math.max(1, ...STATUS_META.map((s) => metrics[s.key]));
  const trackWidth = BAR_CHART_WIDTH - BAR_LABEL_WIDTH - 48;
  const chartHeight = STATUS_META.length * BAR_GAP;

  return (
    <div
      className="viz-root"
      style={
        {
          "--status-good": "#0ca30c",
          "--status-warning": "#fab219",
          "--status-critical": "#d03b3b",
          "--status-neutral": "#898781",
        } as React.CSSProperties
      }
    >
      <svg
        viewBox={`0 0 ${BAR_CHART_WIDTH} ${chartHeight}`}
        width="100%"
        role="img"
        aria-label="Cotações de frete por status"
      >
        {STATUS_META.map((status, index) => {
          const value = metrics[status.key];
          const width = (value / maxValue) * trackWidth;
          const y = index * BAR_GAP + (BAR_GAP - BAR_HEIGHT) / 2;

          return (
            <g key={status.key}>
              <text
                x={BAR_LABEL_WIDTH - 12}
                y={y + BAR_HEIGHT / 2}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-zinc-600 text-[11px] dark:fill-zinc-400"
              >
                {status.label}
              </text>
              <rect
                x={BAR_LABEL_WIDTH}
                y={y}
                width={trackWidth}
                height={BAR_HEIGHT}
                rx={4}
                className="fill-zinc-100 dark:fill-zinc-900"
              />
              {value > 0 && (
                <path
                  d={roundedEndBarPath(BAR_LABEL_WIDTH, y, width, BAR_HEIGHT, 4)}
                  style={{ fill: `var(${status.cssVar})` }}
                >
                  <title>
                    {status.label}: {value}
                  </title>
                </path>
              )}
              <text
                x={BAR_LABEL_WIDTH + Math.max(width, 0) + 8}
                y={y + BAR_HEIGHT / 2}
                dominantBaseline="middle"
                className="fill-zinc-900 text-[11px] font-medium tabular-nums dark:fill-zinc-50"
              >
                {value}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const TREND_WIDTH = 560;
const TREND_HEIGHT = 160;
const TREND_PADDING = { top: 12, right: 12, bottom: 24, left: 32 };

function TrendChart({ data }: { data: { date: string; count: number }[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const maxValue = Math.max(1, ...data.map((d) => d.count));
  const plotWidth = TREND_WIDTH - TREND_PADDING.left - TREND_PADDING.right;
  const plotHeight = TREND_HEIGHT - TREND_PADDING.top - TREND_PADDING.bottom;

  const points = data.map((d, index) => {
    const x =
      TREND_PADDING.left +
      (data.length === 1 ? 0 : (index / (data.length - 1)) * plotWidth);
    const y =
      TREND_PADDING.top + plotHeight - (d.count / maxValue) * plotHeight;
    return { x, y, ...d };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  function handleMove(event: React.PointerEvent<SVGRectElement>) {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relativeX = ((event.clientX - rect.left) / rect.width) * TREND_WIDTH;
    let nearest = 0;
    let nearestDistance = Infinity;
    points.forEach((p, i) => {
      const distance = Math.abs(p.x - relativeX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div
      className="viz-root relative"
      style={
        {
          "--trend-line": "#2a78d6",
        } as React.CSSProperties
      }
    >
      <style>{`
        @media (prefers-color-scheme: dark) {
          .viz-root { --trend-line: #3987e5; }
        }
      `}</style>
      <svg
        viewBox={`0 0 ${TREND_WIDTH} ${TREND_HEIGHT}`}
        width="100%"
        role="img"
        aria-label="Cotações de frete criadas nos últimos 7 dias"
      >
        <line
          x1={TREND_PADDING.left}
          y1={TREND_PADDING.top + plotHeight}
          x2={TREND_WIDTH - TREND_PADDING.right}
          y2={TREND_PADDING.top + plotHeight}
          className="stroke-zinc-300 dark:stroke-zinc-700"
          strokeWidth={1}
        />

        <path
          d={linePath}
          fill="none"
          style={{ stroke: "var(--trend-line)" }}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((p, i) => (
          <text
            key={p.date}
            x={p.x}
            y={TREND_HEIGHT - 6}
            textAnchor="middle"
            className="fill-zinc-500 text-[10px] dark:fill-zinc-400"
          >
            {i === 0 || i === points.length - 1 ? formatShortDate(p.date) : ""}
          </text>
        ))}

        {hovered && (
          <line
            x1={hovered.x}
            y1={TREND_PADDING.top}
            x2={hovered.x}
            y2={TREND_PADDING.top + plotHeight}
            className="stroke-zinc-300 dark:stroke-zinc-600"
            strokeWidth={1}
          />
        )}

        {points.map((p, i) => (
          <g key={`dot-${p.date}`}>
            {i === points.length - 1 && (
              <>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={6}
                  className="fill-white dark:fill-zinc-950"
                />
                <circle cx={p.x} cy={p.y} r={4} style={{ fill: "var(--trend-line)" }} />
              </>
            )}
            {hoverIndex === i && i !== points.length - 1 && (
              <circle cx={p.x} cy={p.y} r={4} style={{ fill: "var(--trend-line)" }} />
            )}
          </g>
        ))}

        <rect
          x={TREND_PADDING.left}
          y={TREND_PADDING.top}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          onPointerMove={handleMove}
          onPointerLeave={() => setHoverIndex(null)}
        />
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
          style={{ left: `${(hovered.x / TREND_WIDTH) * 100}%` }}
        >
          <p className="font-semibold text-zinc-900 dark:text-zinc-50">
            {hovered.count}{" "}
            {hovered.count === 1 ? "cotação" : "cotações"}
          </p>
          <p className="text-zinc-500 dark:text-zinc-400">
            {formatShortDate(hovered.date)}
          </p>
        </div>
      )}

      <details className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        <summary className="cursor-pointer select-none">Ver como tabela</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="py-1 pr-4 font-medium">Data</th>
              <th className="py-1 font-medium">Cotações</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.date}>
                <td className="py-1 pr-4 tabular-nums">{d.date}</td>
                <td className="py-1 tabular-nums">{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export default function DashboardPage() {
  const { user, accessToken } = useAuth();
  const router = useRouter();

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;

    async function load() {
      try {
        const data = await apiFetch<DashboardMetrics>("/dashboard/metrics", {
          token: accessToken,
        });
        if (!cancelled) {
          setMetrics(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Falha ao carregar métricas do dashboard",
          );
        }
      }
    }

    void load();
    const interval = setInterval(() => void load(), REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [accessToken]);

  if (!user) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Dashboard operacional
      </h1>

      {error && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {!metrics ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Carregando métricas…
        </p>
      ) : (
        <div className="space-y-8">
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile
              label="Total de cotações"
              value={metrics.totalFreightQuotes.toLocaleString("pt-BR")}
            />
            <StatTile
              label="Preço médio"
              value={
                metrics.avgFreightPrice !== null
                  ? formatCurrency(metrics.avgFreightPrice)
                  : "—"
              }
            />
            <StatTile
              label="Transportadoras ativas"
              value={metrics.totalActiveCarriers.toLocaleString("pt-BR")}
            />
            <StatTile
              label="Clientes"
              value={metrics.totalActiveClients.toLocaleString("pt-BR")}
            />
            <StatTile
              label="Taxa de erro"
              value={formatPercent(metrics.errorRate)}
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Cotações por status
              </h2>
              <StatusBreakdownChart metrics={metrics.freightQuotesByStatus} />
            </div>

            <div className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Cotações — últimos 7 dias
              </h2>
              <TrendChart data={metrics.freightQuotesLast7Days} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
