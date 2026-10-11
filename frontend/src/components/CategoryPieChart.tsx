import { useMemo } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Transaction } from "../types";

interface CategoryPieChartProps {
  transactions: Transaction[];
}

interface ChartRow {
  name: string;
  value: number;
}

const COLORS = ["#2563eb", "#0ea5e9", "#14b8a6", "#22c55e", "#f59e0b", "#f97316", "#ef4444", "#a855f7"];

export default function CategoryPieChart({ transactions }: CategoryPieChartProps) {
  const data = useMemo<ChartRow[]>(() => {
    const grouped = new Map<string, number>();

    for (const transaction of transactions) {
      if (transaction.category.trim().toLowerCase() === "income") {
        continue;
      }

      if (transaction.currency.trim().toUpperCase() !== "EUR") {
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
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

  return (
    <section className="card chart-card">
      <h2>Category distribution</h2>
      {data.length === 0 ? (
        <p className="empty">No data for chart.</p>
      ) : (
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="70%" label>
                {data.map((entry, index) => (
                  <Cell key={`${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => value.toFixed(2)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

