import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { money } from "@/lib/store";
import type { Trends } from "../../../convex/stats";

/**
 * The dashboard's graphics, all four drawn from the shop's own colour tokens
 * (`--link`, `--success`, `--offer`) so a chart never introduces a colour the
 * rest of the hub does not already use. Each one carries a written summary in
 * its `aria-label`, because a bar chart that only exists as pixels tells a
 * screen-reader user nothing.
 *
 * Sizing note: every chart sits in a fixed-height box rather than
 * `aspect-video`. On a phone an aspect-ratio box collapses to a strip too
 * short to read, and Recharts would rather measure a box that already has a
 * height than one that arrives with none.
 */

/** GH₵ without the repeated prefix inside tight chart labels. */
const cedi = (n: number) => `₵${n.toLocaleString("en-GH")}`;

const gridStroke = "var(--border)";

/* ---------------------------------------------------------------- till tape */

const tillConfig = {
  orders: { label: "Orders", color: "var(--link)" },
  revenue: { label: "Takings", color: "var(--success)" },
} satisfies ChartConfig;

/**
 * Fourteen days of orders as bars with the takings line over them — the one
 * chart the owner actually reads, so it gets the wide slot.
 */
export function TillTape({ daily }: { daily: Trends["daily"] }) {
  const orders = daily.reduce((sum, d) => sum + d.orders, 0);
  const revenue = daily.reduce((sum, d) => sum + d.revenue, 0);
  const summary = `Orders and takings for the last ${daily.length} days: ${orders} orders worth ${money(
    revenue,
    true,
  )}.`;

  return (
    <div>
      <ChartContainer
        config={tillConfig}
        className="h-[220px] w-full"
        role="img"
        aria-label={summary}
      >
        <ComposedChart data={daily} margin={{ top: 8, right: 4, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke={gridStroke} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            fontSize={11}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="left"
            tickLine={false}
            axisLine={false}
            width={34}
            fontSize={11}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickLine={false}
            axisLine={false}
            width={52}
            fontSize={11}
            tickFormatter={(v: number) => cedi(v)}
          />
          <Tooltip
            cursor={{ stroke: gridStroke, strokeDasharray: "3 3" }}
            content={
              <ChartTooltipContent
                labelFormatter={(_label, payload) => {
                  const day = payload?.[0]?.payload as { date?: string } | undefined;
                  return day?.date ?? "";
                }}
                formatter={(value, name) => (
                  <span className="flex w-full items-center justify-between gap-4">
                    <span className="text-muted-foreground">
                      {name === "revenue" ? "Takings" : "Orders"}
                    </span>
                    <span className="font-mono font-medium tabular-nums">
                      {name === "revenue" ? money(Number(value), true) : Number(value)}
                    </span>
                  </span>
                )}
              />
            }
          />
          <Bar
            yAxisId="left"
            dataKey="orders"
            fill="var(--color-orders)"
            radius={[3, 3, 0, 0]}
            maxBarSize={22}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="revenue"
            stroke="var(--color-revenue)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ChartContainer>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px] bg-(--color-orders)" aria-hidden /> Orders per day
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-(--color-revenue)" aria-hidden /> Takings (confirmed)
        </span>
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- pipeline */

const PIPELINE_TONE: Record<Trends["statuses"][number]["status"], string> = {
  received: "var(--offer)",
  processing: "var(--link)",
  ready: "var(--link)",
  dispatched: "var(--link)",
  completed: "var(--success)",
  cancelled: "var(--destructive)",
};

const PIPELINE_LABEL: Record<Trends["statuses"][number]["status"], string> = {
  received: "Received",
  processing: "Processing",
  ready: "Ready",
  dispatched: "Dispatched",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * Where the pipeline sits right now. A horizontal bar per stage rather than a
 * pie: staff read this as "six waiting, two ready", which is a count to act on,
 * not a proportion to admire.
 */
export function PipelineChart({ statuses }: { statuses: Trends["statuses"] }) {
  const data = statuses.map((s) => ({ ...s, label: PIPELINE_LABEL[s.status] }));
  const summary = `Order pipeline: ${
    data
      .filter((d) => d.count > 0)
      .map((d) => `${d.count} ${d.label.toLowerCase()}`)
      .join(", ") || "no orders yet"
  }.`;

  return (
    <ChartContainer config={{}} className="h-[196px] w-full" role="img" aria-label={summary}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
        <CartesianGrid horizontal={false} stroke={gridStroke} strokeDasharray="3 3" />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          fontSize={11}
        />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={78}
          fontSize={11}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)" }}
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(value, name) => (
                <span className="flex w-full items-center justify-between gap-4">
                  <span className="text-muted-foreground">{String(name)}</span>
                  <span className="font-mono font-medium tabular-nums">{Number(value)}</span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="count" name="Orders" radius={[0, 3, 3, 0]} maxBarSize={16}>
          {data.map((d) => (
            <Cell key={d.status} fill={PIPELINE_TONE[d.status]} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/* --------------------------------------------------------- pickup/delivery */

const FULFIL_TONE = { pickup: "var(--link)", delivery: "var(--offer)" } as const;

/**
 * Pickup against delivery as a donut. It is the one genuinely proportional
 * fact on the page — "is this mostly a walk-in shop or a delivery shop" — so
 * it is the one place a circle earns its keep.
 */
export function FulfilmentSplit({ fulfilment }: { fulfilment: Trends["fulfilment"] }) {
  const total = fulfilment.pickup + fulfilment.delivery;
  const data = [
    { key: "pickup", label: "Pickup", value: fulfilment.pickup },
    { key: "delivery", label: "Delivery", value: fulfilment.delivery },
  ].filter((d) => d.value > 0);
  const summary =
    total === 0
      ? "No orders yet, so there is nothing to split between pickup and delivery."
      : `Fulfilment split across ${total} orders: ${fulfilment.pickup} pickup, ${fulfilment.delivery} delivery.`;

  if (total === 0) {
    return (
      <p className="flex h-[196px] items-center justify-center text-sm text-muted-foreground">
        No orders yet.
      </p>
    );
  }

  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;

  return (
    <div role="img" aria-label={summary} className="flex flex-col items-center gap-4 sm:flex-row">
      <ChartContainer config={{}} className="h-[150px] w-[150px] shrink-0">
        <PieChart>
          <Tooltip
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value, name) => (
                  <span className="flex w-full items-center justify-between gap-4">
                    <span className="text-muted-foreground">{String(name)}</span>
                    <span className="font-mono font-medium tabular-nums">{Number(value)}</span>
                  </span>
                )}
              />
            }
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius={38}
            outerRadius={62}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((d) => (
              <Cell key={d.key} fill={FULFIL_TONE[d.key as keyof typeof FULFIL_TONE]} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="w-full space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: FULFIL_TONE[d.key as keyof typeof FULFIL_TONE] }}
                aria-hidden
              />
              {d.label}
            </span>
            <span className="font-mono font-semibold tabular-nums">
              {d.value}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                {pct(d.value)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------- top sellers */

/**
 * What is actually selling, by units. Horizontal so long product names stay
 * readable — the shop's names run to six words, and a vertical bar chart would
 * shred them.
 */
export function TopSellers({ products }: { products: Trends["top_products"] }) {
  if (products.length === 0) {
    return (
      <p className="flex h-[196px] items-center justify-center text-sm text-muted-foreground">
        Nothing has sold yet.
      </p>
    );
  }
  const summary = `Best sellers by units: ${products
    .map((p) => `${p.name} ${p.units}`)
    .join(", ")}.`;

  const data = products.map((p) => ({
    ...p,
    // Recharts truncates on its own terms; cutting here keeps the tooltip honest.
    label: p.name.length > 24 ? `${p.name.slice(0, 23)}…` : p.name,
  }));

  return (
    <ChartContainer
      config={{ units: { label: "Units sold", color: "var(--link)" } }}
      className="h-[210px] w-full"
      role="img"
      aria-label={summary}
    >
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 4 }}>
        <CartesianGrid horizontal={false} stroke={gridStroke} strokeDasharray="3 3" />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          fontSize={11}
        />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={130}
          fontSize={11}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)" }}
          content={
            <ChartTooltipContent
              labelKey="name"
              formatter={(value, name) => (
                <span className="flex w-full items-center justify-between gap-4">
                  <span className="text-muted-foreground">
                    {name === "revenue" ? "Value" : "Units"}
                  </span>
                  <span className="font-mono font-medium tabular-nums">
                    {name === "revenue" ? money(Number(value), true) : Number(value)}
                  </span>
                </span>
              )}
            />
          }
        />
        <Bar
          dataKey="units"
          name="Units"
          fill="var(--color-units)"
          radius={[0, 3, 3, 0]}
          maxBarSize={16}
        />
      </BarChart>
    </ChartContainer>
  );
}
