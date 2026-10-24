import { useMemo } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Transaction } from "../types";

interface CategoryPieChartProps {
  /** Rows after all filters; only these are drawn. */
  transactions: Transaction[];
  /** Rows before the category/subcategory filters; used so the legend can list (and re-add) hidden categories. */
  allTransactions?: Transaction[];
  onCategoryClick?: (category: string) => void;
}

interface ChartRow {
  name: string;
  value: number;
}

const COLORS = ["#6366f1", "#38bdf8", "#2dd4bf", "#a3e635", "#fbbf24", "#fb923c", "#f472b6", "#a78bfa", "#94a3b8"];

function groupByCategory(transactions: Transaction[]): ChartRow[] {
  const grouped = new Map<string, number>();

  for (const transaction of transactions) {
    if (transaction.category.trim().toLowerCase() === "income") {
      continue;
    }

    const numericAmount = Number.parseFloat(transaction.amount);
    if (Number.isNaN(numericAmount)) {
      continue;
    }

    // Use absolute amount so both income and expenses are visible in the pie chart.
    const normalized = Math.abs(numericAmount);
    grouped.set(transaction.category, (grouped.get(transaction.category) ?? 0) + normalized);
  }

  return Array.from(grouped.entries())
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);
}

export default function CategoryPieChart({ transactions, allTransactions, onCategoryClick }: CategoryPieChartProps) {
  const data = useMemo(() => groupByCategory(transactions), [transactions]);
  const allData = useMemo(
    () => (allTransactions ? groupByCategory(allTransactions) : data),
    [allTransactions, data]
  );

  // Colors follow the unfiltered order, so a category keeps its color when others are hidden.
  const colorByCategory = useMemo(() => {
    const colors = new Map<string, string>();
    allData.forEach((row, index) => colors.set(row.name, COLORS[index % COLORS.length]));
    return colors;
  }, [allData]);

  const activeCategories = useMemo(() => new Set(data.map((row) => row.name)), [data]);

  const legendPayload = useMemo(
    () =>
      allData.map((row) => ({
        id: row.name,
        value: row.name,
        type: "circle" as const,
        color: activeCategories.has(row.name) ? colorByCategory.get(row.name) : "#9a9aa3"
      })),
    [allData, activeCategories, colorByCategory]
  );

  return (
    <section className="card chart-card">
      <h2>Category distribution</h2>
      {onCategoryClick && data.length > 0 && <p className="chart-hint">Click a category to hide or show it</p>}
      {allData.length === 0 ? (
        <p className="empty">No data for chart.</p>
      ) : (
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="52%"
                outerRadius="72%"
                paddingAngle={2}
                cornerRadius={4}
                stroke="none"
                label={({ value }: { value: number }) => value.toFixed(2)}
                onClick={(entry: { name?: string }) => {
                  if (entry.name) {
                    onCategoryClick?.(entry.name);
                  }
                }}
                className={onCategoryClick ? "pie-clickable" : undefined}
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={colorByCategory.get(entry.name)} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => value.toFixed(2)} />
              <Legend
                iconType="circle"
                iconSize={8}
                payload={legendPayload}
                formatter={(value: string) => (
                  <span className={activeCategories.has(value) ? undefined : "legend-inactive"}>{value}</span>
                )}
                onClick={(entry: { value?: string }) => {
                  if (entry.value) {
                    onCategoryClick?.(entry.value);
                  }
                }}
                wrapperStyle={onCategoryClick ? { cursor: "pointer" } : undefined}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

