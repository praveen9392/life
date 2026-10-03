import { useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "../../../components/common/EmptyState";
import { QueryStateBoundary } from "../../../components/common/QueryStateBoundary";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Skeleton } from "../../../components/ui/Skeleton";
import { useChartColors } from "../../../hooks/useChartColors";
import { cn } from "../../../utils/cn";
import type { HealthMetric, HealthMetricType } from "../api";
import { useCreateHealthMetric, useDeleteHealthMetric, useHealthMetrics } from "../hooks";

const METRIC_TABS: Array<{ value: HealthMetricType | undefined; label: string }> = [
  { value: undefined, label: "All" },
  { value: "weight", label: "Weight" },
  { value: "water", label: "Water" },
  { value: "sleep", label: "Sleep" },
  { value: "steps", label: "Steps" },
];

const DEFAULT_UNITS: Record<HealthMetricType, string> = {
  weight: "kg",
  water: "ml",
  sleep: "hours",
  steps: "steps",
  resting_heart_rate: "bpm",
  custom: "",
};

function formatRecordedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatChartDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Builds a dynamic, data-driven summary line for the hero - e.g. "7
 * entries logged this week, latest weight 72 kg". */
function buildHeroSummary(metrics: HealthMetric[]): string {
  if (metrics.length === 0) {
    return "Track metrics you choose to record. This is a log, not medical advice.";
  }
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeek = metrics.filter((metric) => new Date(metric.recorded_at).getTime() >= weekAgo);
  const latest = [...metrics].sort(
    (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
  )[0];
  return `${thisWeek.length} entr${thisWeek.length === 1 ? "y" : "ies"} logged this week · latest: ${latest.value} ${latest.unit} ${latest.metric_type.replace("_", " ")}`;
}

/** Trend chart for the currently selected metric type - skipped for "All"
 * since units/scales differ across metric types. */
function MetricTrendChart({ metrics, type }: { metrics: HealthMetric[]; type: HealthMetricType }) {
  const colors = useChartColors();
  const data = useMemo(
    () =>
      [...metrics]
        .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
        .map((metric) => ({
          date: formatChartDate(metric.recorded_at),
          value: metric.value,
          unit: metric.unit,
        })),
    [metrics],
  );

  if (data.length < 2) return null;

  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-text capitalize">{type.replace("_", " ")} trend</h2>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
          <XAxis
            dataKey="date"
            stroke={colors.textMuted}
            tick={{ fontSize: 11, fill: colors.textMuted }}
            tickLine={false}
            axisLine={{ stroke: colors.border }}
          />
          <YAxis
            stroke={colors.textMuted}
            tick={{ fontSize: 11, fill: colors.textMuted }}
            tickLine={false}
            axisLine={false}
            width={40}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              fontSize: 12,
              color: colors.text,
            }}
            formatter={(value: unknown, _name: unknown, item: { payload?: { unit?: string } }) => [
              `${value as number} ${item?.payload?.unit ?? ""}`.trim(),
              "Value",
            ]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={colors.accent}
            strokeWidth={2}
            dot={{ r: 3, fill: colors.accent }}
            activeDot={{ r: 5 }}
            isAnimationActive
          />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}

export default function HealthPage() {
  const [metricType, setMetricType] = useState<HealthMetricType | undefined>("weight");
  const metricsQuery = useHealthMetrics(metricType);
  const allMetricsQuery = useHealthMetrics(undefined);
  const createMetric = useCreateHealthMetric();
  const deleteMetric = useDeleteHealthMetric();

  const [value, setValue] = useState("");
  const [unit, setUnit] = useState(DEFAULT_UNITS.weight);
  const [note, setNote] = useState("");

  const selectTab = (type: HealthMetricType | undefined) => {
    setMetricType(type);
    if (type) setUnit(DEFAULT_UNITS[type]);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = Number(value);
    const type = metricType ?? "weight";
    if (!Number.isFinite(parsed) || parsed <= 0 || !unit.trim() || createMetric.isPending) return;
    createMetric.mutate(
      { metric_type: type, value: parsed, unit: unit.trim(), note: note || null },
      { onSuccess: () => { setValue(""); setNote(""); } },
    );
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text">Health</h1>
        <p className="mt-1 text-sm text-text-muted">
          {buildHeroSummary(allMetricsQuery.data?.items ?? [])}
        </p>
      </header>

      <div role="tablist" aria-label="Metric type" className="flex flex-wrap gap-1">
        {METRIC_TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={metricType === tab.value}
            onClick={() => selectTab(tab.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              metricType === tab.value
                ? "bg-accent/10 text-accent"
                : "text-text-muted hover:bg-surface-hover hover:text-text",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {metricType ? (
        <form onSubmit={submit} className="card flex flex-wrap items-end gap-3" aria-label="Log metric">
          <div className="w-28">
            <Input
              label="Value"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              required
            />
          </div>
          <div className="w-24">
            <Input
              label="Unit"
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              maxLength={20}
              required
            />
          </div>
          <div className="min-w-40 flex-1">
            <Input
              label="Note (optional)"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={2000}
            />
          </div>
          <Button type="submit" isLoading={createMetric.isPending}>
            <Plus className="h-4 w-4" aria-hidden />
            Log
          </Button>
        </form>
      ) : (
        <p className="text-sm text-text-muted">Select a metric type above to log a new entry.</p>
      )}
      {createMetric.isError ? (
        <p role="alert" className="text-sm text-danger">{createMetric.error.message}</p>
      ) : null}

      <QueryStateBoundary
        query={metricsQuery}
        skeleton={
          <div className="space-y-2" aria-hidden>
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        }
        empty={
          <EmptyState title="No entries yet" description="Log a metric above to start tracking." />
        }
      >
        {(page) =>
          page.items.length === 0 ? (
            <EmptyState title="No entries yet" description="Log a metric above to start tracking." />
          ) : (
            <div className="space-y-4">
              {metricType ? <MetricTrendChart metrics={page.items} type={metricType} /> : null}
              <ul className="space-y-2" aria-label="Health metrics">
                {page.items.map((metric) => (
                  <motion.li
                    key={metric.id}
                    whileHover={{ y: -1 }}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 transition-shadow hover:shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text">
                        {metric.value} {metric.unit}
                        <span className="ml-2 font-normal text-text-muted">{metric.metric_type}</span>
                      </p>
                      <p className="text-xs text-text-muted">
                        {formatRecordedAt(metric.recorded_at)}
                        {metric.note ? ` · ${metric.note}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteMetric.mutate(metric.id)}
                      disabled={deleteMetric.isPending}
                      aria-label={`Delete ${metric.metric_type} entry`}
                      className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-danger disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </motion.li>
                ))}
              </ul>
            </div>
          )
        }
      </QueryStateBoundary>
    </div>
  );
}
