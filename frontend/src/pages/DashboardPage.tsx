import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { exportTransactionsExcel, fetchDictionaries, fetchTransactions, type DateRange } from "../api";
import type { DictionariesResponse, Transaction } from "../types";
import TransactionsTable from "../components/TransactionsTable";
import CategoryPieChart from "../components/CategoryPieChart";
import DateRangePicker, { monthRange } from "../components/DateRangePicker";

const currentDate = new Date();
const DEFAULT_RANGE = monthRange(currentDate.getFullYear(), currentDate.getMonth());
const CURRENCIES = ["EUR", "RUB"] as const;
type Currency = (typeof CURRENCIES)[number];
const FILTERS_STORAGE_KEY = "dashboard-filters";

interface SavedFilters {
  /** null means "all time". */
  range: DateRange | null;
  currency: Currency;
  /** Categories and subcategories are stored as the unchecked values, so new ones show up checked. */
  excludedCategories: string[];
  excludedSubcategories: string[];
  persons: string[];
  tags: string[];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

// Filters are kept in localStorage so they survive going to the add page and back.
function loadSavedFilters(): SavedFilters {
  const defaults: SavedFilters = { range: DEFAULT_RANGE, currency: "EUR", excludedCategories: [], excludedSubcategories: [], persons: [], tags: [] };
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) {
      return defaults;
    }
    const saved = JSON.parse(raw);
    const range = saved?.range;
    return {
      range:
        range === null
          ? null
          : range && typeof range.from === "string" && typeof range.to === "string"
            ? { from: range.from, to: range.to }
            : defaults.range,
      currency: CURRENCIES.find((currency) => currency === saved?.currency) ?? defaults.currency,
      excludedCategories: isStringArray(saved?.excludedCategories)
        ? saved.excludedCategories
        : defaults.excludedCategories,
      excludedSubcategories: isStringArray(saved?.excludedSubcategories)
        ? saved.excludedSubcategories
        : defaults.excludedSubcategories,
      persons: isStringArray(saved?.persons) ? saved.persons : defaults.persons,
      tags: isStringArray(saved?.tags) ? saved.tags : defaults.tags
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
  const [dictionaries, setDictionaries] = useState<DictionariesResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [selectedRange, setSelectedRange] = useState<DateRange | null>(savedFilters.range);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>(savedFilters.currency);
  const [excludedCategories, setExcludedCategories] = useState<string[]>(savedFilters.excludedCategories);
  const [excludedSubcategories, setExcludedSubcategories] = useState<string[]>(savedFilters.excludedSubcategories);
  const [selectedPersons, setSelectedPersons] = useState<string[]>(savedFilters.persons);
  const [selectedTags, setSelectedTags] = useState<string[]>(savedFilters.tags);

  useEffect(() => {
    const filters: SavedFilters = {
      range: selectedRange,
      currency: selectedCurrency,
      excludedCategories,
      excludedSubcategories,
      persons: selectedPersons,
      tags: selectedTags
    };
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // Storage can be unavailable (e.g. private mode); filters then just reset on reload.
    }
  }, [selectedRange, selectedCurrency, excludedCategories, excludedSubcategories, selectedPersons, selectedTags]);

  async function loadTransactions(range: DateRange | null = selectedRange) {
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

  async function loadDictionaries() {
    const data = await fetchDictionaries();
    setDictionaries(data);
    return data;
  }

  // The inline editor needs categories, persons and tags; they are loaded once, on the first switch to edit mode.
  useEffect(() => {
    if (!editMode || dictionaries) {
      return;
    }

    loadDictionaries().catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load dictionaries");
    });
  }, [editMode, dictionaries]);

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

  const selectedCategories = useMemo(
    () => categoryOptions.filter((category) => !excludedCategories.includes(category)),
    [categoryOptions, excludedCategories]
  );

  const subcategoryOptions = useMemo(() => {
    const source = currencyTransactions.filter((t) => !excludedCategories.includes(t.category));
    return uniqueSorted(source.map((t) => t.subCategory));
  }, [currencyTransactions, excludedCategories]);

  const selectedSubcategories = useMemo(
    () => subcategoryOptions.filter((subcategory) => !excludedSubcategories.includes(subcategory)),
    [subcategoryOptions, excludedSubcategories]
  );

  const personOptions = useMemo(() => uniqueSorted(currencyTransactions.map((t) => t.person)), [currencyTransactions]);

  const tagOptions = useMemo(
    () => uniqueSorted(currencyTransactions.flatMap((t) => t.tags)),
    [currencyTransactions]
  );

  // Person and tag filters narrow the rows the chart legend is built from, like the period and currency.
  const personTransactions = useMemo(() => {
    return currencyTransactions.filter(
      (t) =>
        (selectedPersons.length === 0 || (t.person !== null && selectedPersons.includes(t.person))) &&
        (selectedTags.length === 0 || t.tags.some((tag) => selectedTags.includes(tag)))
    );
  }, [currencyTransactions, selectedPersons, selectedTags]);

  const filteredTransactions = useMemo(() => {
    return personTransactions.filter(
      (t) =>
        !excludedCategories.includes(t.category) &&
        (t.subCategory === null || !excludedSubcategories.includes(t.subCategory))
    );
  }, [personTransactions, excludedCategories, excludedSubcategories]);

  // Unchecked values are kept even when they are not in the current options, so they stay unchecked
  // after switching period or currency.
  const handleCategoriesChange = (selected: string[]) => {
    setExcludedCategories((prev) => [
      ...prev.filter((category) => !categoryOptions.includes(category)),
      ...categoryOptions.filter((category) => !selected.includes(category))
    ]);
  };

  const handleSubcategoriesChange = (selected: string[]) => {
    setExcludedSubcategories((prev) => [
      ...prev.filter((subcategory) => !subcategoryOptions.includes(subcategory)),
      ...subcategoryOptions.filter((subcategory) => !selected.includes(subcategory))
    ]);
  };

  // With everything checked, clicking a category keeps only that one; after that each click (slice or
  // legend) toggles a category on or off. Unchecking the last category goes back to all checked.
  const handleChartCategoryClick = (category: string) => {
    if (selectedCategories.length === categoryOptions.length) {
      handleCategoriesChange([category]);
      return;
    }

    const next = selectedCategories.includes(category)
      ? selectedCategories.filter((value) => value !== category)
      : [...selectedCategories, category];
    handleCategoriesChange(next.length > 0 ? next : categoryOptions);
  };

  const clearFilters = () => {
    setExcludedCategories([]);
    setExcludedSubcategories([]);
    setSelectedPersons([]);
    setSelectedTags([]);
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
              {/* Both labels share one grid cell, so the button keeps the width of the longer one. */}
              <span className="toggle-label">
                <span aria-hidden={editMode}>Edit rows</span>
                <span aria-hidden={!editMode}>Done</span>
              </span>
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

      {/* In edit mode the chart is hidden and the table takes the full width, so a row being edited fits its fields. */}
      <section className={editMode ? "grid-two-columns grid-editing" : "grid-two-columns"}>
        <TransactionsTable
          transactions={filteredTransactions}
          onTransactionDeleted={handleTransactionDeleted}
          editMode={editMode}
          dictionaries={dictionaries}
          onDictionariesChanged={loadDictionaries}
          onTransactionUpdated={() => void loadTransactions()}
          filters={{
            category: {
              selected: selectedCategories,
              options: categoryOptions,
              onChange: handleCategoriesChange,
              allByDefault: true
            },
            subcategory: {
              selected: selectedSubcategories,
              options: subcategoryOptions,
              onChange: handleSubcategoriesChange,
              allByDefault: true
            },
            person: { selected: selectedPersons, options: personOptions, onChange: setSelectedPersons },
            tags: { selected: selectedTags, options: tagOptions, onChange: setSelectedTags },
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
        {/* The chart shows only the active categories; hidden ones stay in the legend so they can be re-added. */}
        {!editMode && (
          <CategoryPieChart
            transactions={filteredTransactions}
            allTransactions={personTransactions}
            onCategoryClick={handleChartCategoryClick}
          />
        )}
      </section>
    </main>
  );
}
