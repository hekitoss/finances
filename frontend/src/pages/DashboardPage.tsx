import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { exportTransactionsExcel, fetchTransactions } from "../api";
import type { Transaction } from "../types";
import TransactionsTable from "../components/TransactionsTable";
import CategoryPieChart from "../components/CategoryPieChart";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

const currentDate = new Date();
const DEFAULT_MONTH = currentDate.getMonth() + 1;
const DEFAULT_YEAR = currentDate.getFullYear();

const YEARS = Array.from({ length: 11 }, (_, index) => DEFAULT_YEAR - 5 + index);

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<number>(DEFAULT_MONTH);
  const [selectedYear, setSelectedYear] = useState<number>(DEFAULT_YEAR);

  async function loadTransactions(month: number = selectedMonth, year: number = selectedYear) {
    setLoading(true);
    setError("");
    try {
      const data = await fetchTransactions({ month, year });
      setTransactions(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTransactions(selectedMonth, selectedYear);
  }, [selectedMonth, selectedYear]);

  const handleTransactionDeleted = (id: number) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  const handleExport = async () => {
    setExporting(true);
    setError("");

    try {
      await exportTransactionsExcel({ month: selectedMonth, year: selectedYear });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setExporting(false);
    }
  };

  const amountSummary = useMemo(() => {
    return transactions.reduce(
      (totals, item) => {
        const parsed = Number.parseFloat(item.amount);
        if (Number.isNaN(parsed)) {
          return totals;
        }

        if (parsed < 0) {
          totals.expenses += parsed;
        } else {
          totals.income += parsed;
        }

        totals.total += parsed;
        return totals;
      },
      { expenses: 0, income: 0, total: 0 }
    );
  }, [transactions]);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Finances Dashboard</h1>
          <p>Transactions table and category pie chart</p>
        </div>
        <div className="header-actions">
          <div className="period-filters">
            <label>
              Month
              <select
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(Number(event.target.value))}
                disabled={loading}
              >
                {MONTH_NAMES.map((monthName, index) => (
                  <option key={monthName} value={index + 1}>
                    {monthName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Year
              <select
                value={selectedYear}
                onChange={(event) => setSelectedYear(Number(event.target.value))}
                disabled={loading}
              >
                {YEARS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Link to="/add" className="button-link">
            Add transaction
          </Link>
          <button
            type="button"
            onClick={() => void loadTransactions()}
            className="button-refresh"
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button type="button" onClick={() => void handleExport()} className="button-export" disabled={exporting || loading}>
            {exporting ? "Exporting..." : "Export Excel"}
          </button>
        </div>
      </header>

      {error && <div className="error-box">{error}</div>}

      <section className="stats-grid">
        <article className="stat-card">
          <span>Rows</span>
          <strong>{transactions.length}</strong>
        </article>
        <article className="stat-card">
          <span>Expenses</span>
          <strong>{amountSummary.expenses.toFixed(2)}</strong>
        </article>
        <article className="stat-card">
          <span>Income</span>
          <strong>{amountSummary.income.toFixed(2)}</strong>
        </article>
        <article className="stat-card">
          <span>Total</span>
          <strong>{amountSummary.total.toFixed(2)}</strong>
        </article>
      </section>

      <section className="grid-two-columns">
        <TransactionsTable transactions={transactions} onTransactionDeleted={handleTransactionDeleted} />
        <CategoryPieChart transactions={transactions} />
      </section>
    </main>
  );
}
