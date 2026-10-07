"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  type BucketTotal,
  type EventItem,
  type MonthlySummary,
  type TrendPoint,
  api,
} from "@/lib/api";

// Validated categorical palette (dataviz skill, light surface), used in fixed order.
const SLICE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const OTHER_COLOR = "#94a3b8";
const MAX_NAMED_SLICES = SLICE_COLORS.length;

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function ChangeBadge({ percent }: { percent: number | null }) {
  if (percent === null) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  const up = percent > 0;
  return (
    <span className={`text-xs font-medium ${up ? "text-red-600" : "text-emerald-600"}`}>
      {up ? "▲" : "▼"} {Math.abs(percent).toFixed(1)}%
    </span>
  );
}

export default function DashboardPage() {
  const [month, setMonth] = useState(currentMonth());
  const [events, setEvents] = useState<EventItem[]>([]);
  const [excludedEventIds, setExcludedEventIds] = useState<string[]>([]);

  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [byBucket, setByBucket] = useState<BucketTotal[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [insights, setInsights] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.events
      .list()
      .then(setEvents)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    const [year, mon] = month.split("-").map(Number);
    const from = `${month}-01`;
    const to = new Date(Date.UTC(year!, mon!, 1)).toISOString().slice(0, 10);

    Promise.all([
      api.analytics.summary(month, excludedEventIds),
      api.analytics.byBucket(month, excludedEventIds),
      api.analytics.trend(from, to, "daily"),
      api.analytics.insights(month),
    ])
      .then(([s, b, t, i]) => {
        setSummary(s);
        setByBucket(b);
        setTrend(t);
        setInsights(i.insights);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [month, excludedEventIds]);

  const bucketChartData = useMemo(
    () => byBucket.slice(0, 8).map((b) => ({ name: b.bucketName, total: b.total })),
    [byBucket],
  );

  // Top buckets get a colour each (in fixed order); the rest fold into "Other".
  const shareData = useMemo(() => {
    const grand = byBucket.reduce((sum, b) => sum + b.total, 0);
    if (grand <= 0)
      return { grand: 0, slices: [] as { name: string; total: number; fill: string }[] };
    const sorted = [...byBucket].sort((a, b) => b.total - a.total);
    const named = sorted.slice(0, MAX_NAMED_SLICES);
    const restTotal = sorted.slice(MAX_NAMED_SLICES).reduce((sum, b) => sum + b.total, 0);
    const slices = named.map((b, i) => ({
      name: b.bucketName,
      total: b.total,
      fill: SLICE_COLORS[i]!,
    }));
    if (restTotal > 0) slices.push({ name: "Other", total: restTotal, fill: OTHER_COLOR });
    return { grand, slices };
  }, [byBucket]);

  function toggleEvent(id: string) {
    setExcludedEventIds((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <Input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-auto"
        />
      </div>

      {events.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
          <span className="font-medium text-slate-600">Exclude events:</span>
          {events.map((ev) => (
            <label key={ev.id} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={excludedEventIds.includes(ev.id)}
                onChange={() => toggleEvent(ev.id)}
              />
              {ev.name}
            </label>
          ))}
        </div>
      )}

      {loading || !summary ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Total Spending{excludedEventIds.length > 0 ? " (adjusted)" : ""}
              </CardHeader>
              <CardBody>
                <p data-testid="total-spending" className="text-2xl font-semibold">
                  {formatINR(summary.adjusted.expense)}
                </p>
                {excludedEventIds.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    Unadjusted: {formatINR(summary.total.expense)} (excluded{" "}
                    {formatINR(summary.excludedAmount)})
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  <span className="text-xs text-slate-500">
                    vs last month{" "}
                    <ChangeBadge percent={summary.comparison.previousMonth.percentChange} />
                  </span>
                  <span className="text-xs text-slate-500">
                    vs 3-mo avg{" "}
                    <ChangeBadge percent={summary.comparison.threeMonthAvg.percentChange} />
                  </span>
                  <span className="text-xs text-slate-500">
                    vs 6-mo avg{" "}
                    <ChangeBadge percent={summary.comparison.sixMonthAvg.percentChange} />
                  </span>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardHeader className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Total Income
              </CardHeader>
              <CardBody>
                <p className="text-2xl font-semibold text-emerald-700">
                  {formatINR(summary.adjusted.income)}
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardHeader className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Net Cash Flow
              </CardHeader>
              <CardBody>
                <p
                  className={`text-2xl font-semibold ${summary.adjusted.netCashFlow >= 0 ? "text-emerald-700" : "text-red-600"}`}
                >
                  {formatINR(summary.adjusted.netCashFlow)}
                </p>
              </CardBody>
            </Card>
          </div>

          {insights.length > 0 && (
            <Card className="mb-6">
              <CardHeader className="text-sm font-medium">Insights</CardHeader>
              <CardBody>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {insights.map((insight, i) => (
                    <li key={i}>{insight}</li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="text-sm font-medium">Spending by bucket</CardHeader>
              <CardBody>
                {bucketChartData.length === 0 ? (
                  <p className="text-sm text-slate-500">No categorized spending this month.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={bucketChartData} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => formatINR(v)} fontSize={12} />
                      <YAxis type="category" dataKey="name" width={90} fontSize={12} />
                      <Tooltip formatter={(v: number) => formatINR(v)} />
                      <Bar dataKey="total" fill="#0f172a" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader className="text-sm font-medium">Where the money went</CardHeader>
              <CardBody>
                {shareData.slices.length === 0 ? (
                  <p className="text-sm text-slate-500">No categorized spending this month.</p>
                ) : (
                  <div className="flex flex-col items-center gap-4 sm:flex-row">
                    <div className="relative h-[220px] w-[220px] shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={shareData.slices}
                            dataKey="total"
                            nameKey="name"
                            innerRadius={66}
                            outerRadius={104}
                            stroke="#ffffff"
                            strokeWidth={2}
                            isAnimationActive={false}
                          />
                          <Tooltip
                            formatter={(v: number, name: string) => [
                              `${formatINR(v)} · ${((v / shareData.grand) * 100).toFixed(1)}%`,
                              name,
                            ]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xs text-slate-500">Categorized</span>
                        <span className="text-lg font-semibold">{formatINR(shareData.grand)}</span>
                      </div>
                    </div>
                    <ul className="w-full space-y-1.5 text-sm" data-testid="spending-share-legend">
                      {shareData.slices.map((slice) => (
                        <li key={slice.name} className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{ backgroundColor: slice.fill }}
                          />
                          <span className="flex-1 truncate text-slate-700">{slice.name}</span>
                          <span className="tabular-nums text-slate-900">
                            {formatINR(slice.total)}
                          </span>
                          <span className="w-12 text-right tabular-nums text-slate-500">
                            {((slice.total / shareData.grand) * 100).toFixed(1)}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardBody>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="text-sm font-medium">Daily trend</CardHeader>
              <CardBody>
                {trend.length === 0 ? (
                  <p className="text-sm text-slate-500">No transactions this month.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" fontSize={11} tickFormatter={(d) => d.slice(8)} />
                      <YAxis tickFormatter={(v) => formatINR(v)} fontSize={12} width={70} />
                      <Tooltip formatter={(v: number) => formatINR(v)} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="expense"
                        stroke="#dc2626"
                        name="Expense"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="income"
                        stroke="#059669"
                        name="Income"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
