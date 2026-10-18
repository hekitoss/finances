import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { exportTransactionsExcel, fetchTransactions, type DateRange } from "../api";
import type { Transaction } from "../types";
import TransactionsTable from "../components/TransactionsTable";
import CategoryPieChart from "../components/CategoryPieChart";
import DateRangePicker, { monthRange } from "../components/DateRangePicker";

const currentDate = new Date();
const DEFAULT_RANGE = monthRange(currentDate.getFullYear(), currentDate.getMonth());
const CURRENCIES = ["EUR", "RUB"] as const;
type Currency = (typeof CURRENCIES)[number];
const FILTERS_STORAGE_KEY = "dashboard-filters";

interface SavedFilters {
  range: DateRange;
  currency: Currency;
  categories: string[];
  subcategories: string[];
  persons: string[];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

// Filters are kept in localStorage so they survive going to the edit/add pages and back.
function loadSavedFilters(): SavedFilters {
  const defaults: SavedFilters = { range: DEFAULT_RANGE, currency: "EUR", categories: [], subcategories: [], persons: [] };
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) {
      return defaults;
    }
    const saved = JSON.parse(raw);
    const range = saved?.range;
    return {
      range:
        range && typeof range.from === "string" && typeof range.to === "string"
          ? { from: range.from, to: range.to }
          : defaults.range,
      currency: CURRENCIES.find((currency) => currency === saved?.currency) ?? defaults.currency,
      categories: isStringArray(saved?.categories) ? saved.categories : defaults.categories,
      subcategories: isStringArray(saved?.subcategories) ? saved.subcategories : defaults.subcategories,
      persons: isStringArray(saved?.persons) ? saved.persons : defaults.persons
    };
  } catch {
    return defaults;
  }
}

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
  const [savedFilters] = useState(loadSavedFilters);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [selectedRange, setSelectedRange] = useState<DateRange>(savedFilters.range);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>(savedFilters.currency);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(savedFilters.categories);
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>(savedFilters.subcategories);
  const [selectedPersons, setSelectedPersons] = useState<string[]>(savedFilters.persons);

  useEffect(() => {
    const filters: SavedFilters = {
      range: selectedRange,
      currency: selectedCurrency,
      categories: selectedCategories,
      subcategories: selectedSubcategories,
      persons: selectedPersons
    };
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // Storage can be unavailable (e.g. private mode); filters then just reset on reload.
    }
  }, [selectedRange, selectedCurrency, selectedCategories, selectedSubcategories, selectedPersons]);

  async function loadTransactions(range: DateRange = selectedRange) {
    setLoading(true);
    setError("");
    try {
      const data = await fetchTransactions(range);
      setTransactions(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTransactions(selectedRange);
  }, [selectedRange]);

  const handleTransactionDeleted = (id: number) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  const handleExport = async () => {
    setExporting(true);
    setError("");

    try {
      await exportTransactionsExcel(selectedRange);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setExporting(false);
    }
  };

  // Amounts in different currencies must never be summed, so everything below works on one currency only.
  const currencyTransactions = useMemo(() => {
    return transactions.filter((t) => t.currency.trim().toUpperCase() === selectedCurrency);
  }, [transactions, selectedCurrency]);

  const categoryOptions = useMemo(() => uniqueSorted(currencyTransactions.map((t) => t.category)), [currencyTransactions]);

  const subcategoryOptions = useMemo(() => {
    const source =
      selectedCategories.length > 0
        ? currencyTransactions.filter((t) => selectedCategories.includes(t.category))
        : currencyTransactions;
    return uniqueSorted(source.map((t) => t.subCategory));
  }, [currencyTransactions, selectedCategories]);

  const personOptions = useMemo(() => uniqueSorted(currencyTransactions.map((t) => t.person)), [currencyTransactions]);

  // Drop selected subcategories that no longer exist for the chosen categories/period.
  // Wait for the data to load, otherwise restored subcategories would be wiped against an empty list.
  useEffect(() => {
    if (!loading && selectedSubcategories.some((value) => !subcategoryOptions.includes(value))) {
      setSelectedSubcategories((prev) => prev.filter((value) => subcategoryOptions.includes(value)));
    }
  }, [loading, subcategoryOptions, selectedSubcategories]);

  const personTransactions = useMemo(() => {
    return selectedPersons.length > 0
      ? currencyTransactions.filter((t) => t.person !== null && selectedPersons.includes(t.person))
      : currencyTransactions;
  }, [currencyTransactions, selectedPersons]);

  const filteredTransactions = useMemo(() => {
    return personTransactions.filter(
      (t) =>
        (selectedCategories.length === 0 || selectedCategories.includes(t.category)) &&
        (selectedSubcategories.length === 0 || (t.subCategory !== null && selectedSubcategories.includes(t.subCategory)))
    );
  }, [personTransactions, selectedCategories, selectedSubcategories]);

  // Clicking a slice adds that category to the filter, clicking it again removes it.
  const handleChartCategoryClick = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((value) => value !== category) : [...prev, category]
    );
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

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Finances Dashboard</h1>
          <p>Transactions table and category pie chart</p>
        </div>
        <div className="header-actions">
          <div className="period-filters">
            <DateRangePicker value={selectedRange} onChange={setSelectedRange} disabled={loading} />
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
            currency: {
              selected: [selectedCurrency],
              options: [...CURRENCIES],
              onChange: (selected) => {
                const next = CURRENCIES.find((currency) => currency === selected[0]);
                if (next) {
                  setSelectedCurrency(next);
                }
              }
            },
            onClear: clearFilters
          }}
        />
        {/* The chart ignores the category/subcategory filters so every slice stays clickable;
            the selected category is highlighted instead. */}
        <CategoryPieChart
          transactions={personTransactions}
          selectedCategories={selectedCategories}
          onCategoryClick={handleChartCategoryClick}
        />
      </section>
    </main>
  );
}
