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

function uniqueSorted(values: (string | null)[]): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    if (value && value.trim()) {
      unique.add(value);
    }
  }
  return Array.from(unique).sort((a, b) => a.localeCompare(b));
}

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<number>(DEFAULT_MONTH);
  const [selectedYear, setSelectedYear] = useState<number>(DEFAULT_YEAR);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>([]);
  const [selectedPersons, setSelectedPersons] = useState<string[]>([]);

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

  const categoryOptions = useMemo(() => uniqueSorted(transactions.map((t) => t.category)), [transactions]);

  const subcategoryOptions = useMemo(() => {
    const source =
      selectedCategories.length > 0 ? transactions.filter((t) => selectedCategories.includes(t.category)) : transactions;
    return uniqueSorted(source.map((t) => t.subCategory));
  }, [transactions, selectedCategories]);

  const personOptions = useMemo(() => uniqueSorted(transactions.map((t) => t.person)), [transactions]);

  // Drop selected subcategories that no longer exist for the chosen categories/period.
  useEffect(() => {
    if (selectedSubcategories.some((value) => !subcategoryOptions.includes(value))) {
      setSelectedSubcategories((prev) => prev.filter((value) => subcategoryOptions.includes(value)));
    }
  }, [subcategoryOptions, selectedSubcategories]);

  const personTransactions = useMemo(() => {
    return selectedPersons.length > 0
      ? transactions.filter((t) => t.person !== null && selectedPersons.includes(t.person))
      : transactions;
  }, [transactions, selectedPersons]);

  const filteredTransactions = useMemo(() => {
    return personTransactions.filter(
      (t) =>
        (selectedCategories.length === 0 || selectedCategories.includes(t.category)) &&
        (selectedSubcategories.length === 0 || (t.subCategory !== null && selectedSubcategories.includes(t.subCategory)))
    );
  }, [personTransactions, selectedCategories, selectedSubcategories]);

  // Clicking a slice shows only that category; clicking it again when it is the only one selected clears the filter.
  const handleChartCategoryClick = (category: string) => {
    const isOnlySelected = selectedCategories.length === 1 && selectedCategories[0] === category;
    setSelectedCategories(isOnlySelected ? [] : [category]);
  };

  const clearFilters = () => {
    setSelectedCategories([]);
    setSelectedSubcategories([]);
    setSelectedPersons([]);
  };

  const amountSummary = useMemo(() => {
    return filteredTransactions.reduce(
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
  }, [filteredTransactions]);

  // The chart ignores the category/subcategory filters so every slice stays clickable;
  // the selected category is highlighted instead.
  const eurTransactionsForChart = useMemo(() => {
    return personTransactions.filter((transaction) => transaction.currency.trim().toUpperCase() === "EUR");
  }, [personTransactions]);

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
          <div className="header-buttons">
            <Link to="/add" className="button-link">
              Add transaction
            </Link>
            <button
              type="button"
              onClick={() => setEditMode((prev) => !prev)}
              className="button-refresh"
              aria-pressed={editMode}
            >
              {editMode ? "Done" : "Edit rows"}
            </button>
            <button type="button" onClick={() => void handleExport()} className="button-export" disabled={exporting || loading}>
              {exporting ? "Exporting..." : "Export Excel"}
            </button>
          </div>
        </div>
      </header>

      {error && <div className="error-box">{error}</div>}

      <section className="stats-grid">
        <article className="stat-card">
          <span>Rows</span>
          <strong>{filteredTransactions.length}</strong>
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
        <TransactionsTable
          transactions={filteredTransactions}
          onTransactionDeleted={handleTransactionDeleted}
          editMode={editMode}
          filters={{
            category: { selected: selectedCategories, options: categoryOptions, onChange: setSelectedCategories },
            subcategory: { selected: selectedSubcategories, options: subcategoryOptions, onChange: setSelectedSubcategories },
            person: { selected: selectedPersons, options: personOptions, onChange: setSelectedPersons },
            onClear: clearFilters
          }}
        />
        <CategoryPieChart
          transactions={eurTransactionsForChart}
          selectedCategories={selectedCategories}
          onCategoryClick={handleChartCategoryClick}
        />
      </section>
    </main>
  );
}
