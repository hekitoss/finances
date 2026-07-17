import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createCategory,
  createSubcategory,
  fetchDictionaries,
  fetchTransaction,
  updateTransaction
} from "../api";
import type { DictionariesResponse, TransactionCreateRequest } from "../types";

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeAmountInput(value: string): string {
  const sanitized = value.replace(",", ".").replace(/\s+/g, "");

  if (sanitized === "" || sanitized === "-" || sanitized === "." || sanitized === "-.") {
    return sanitized;
  }

  const hasMinus = sanitized.startsWith("-");
  const unsigned = hasMinus ? sanitized.slice(1) : sanitized;
  const digitsAndDot = unsigned.replace(/[^0-9.]/g, "");
  const firstDotIndex = digitsAndDot.indexOf(".");
  const normalizedUnsigned =
    firstDotIndex === -1
      ? digitsAndDot
      : `${digitsAndDot.slice(0, firstDotIndex + 1)}${digitsAndDot.slice(firstDotIndex + 1).replace(/\./g, "")}`;

  if (normalizedUnsigned.length === 0) {
    return hasMinus ? "-" : "";
  }

  return `${hasMinus ? "-" : ""}${normalizedUnsigned}`;
}

export default function EditTransactionPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const transactionId = Number(id);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [creatingSubcategory, setCreatingSubcategory] = useState(false);
  const [error, setError] = useState("");
  const [dictionaries, setDictionaries] = useState<DictionariesResponse | null>(null);
  const [form, setForm] = useState({
    transactionDate: "",
    amount: "",
    currency: "EUR",
    personId: "",
    categoryId: "",
    subcategoryId: "",
    comment: ""
  });

  const isValidTransactionId = Number.isInteger(transactionId) && transactionId > 0;

  async function loadDictionaries() {
    const data = await fetchDictionaries();
    setDictionaries(data);
    return data;
  }

  useEffect(() => {
    let active = true;

    async function loadPageData() {
      if (!isValidTransactionId) {
        setError("Invalid transaction id.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const [dictionariesData, transaction] = await Promise.all([
          fetchDictionaries(),
          fetchTransaction(transactionId)
        ]);

        if (!active) {
          return;
        }

        setDictionaries(dictionariesData);
        setForm({
          transactionDate: transaction.transactionDate,
          amount: transaction.amount,
          currency: transaction.currency,
          personId: transaction.personId ? String(transaction.personId) : "",
          categoryId: String(transaction.categoryId),
          subcategoryId: transaction.subcategoryId ? String(transaction.subcategoryId) : "",
          comment: transaction.comment ?? ""
        });
      } catch (err) {
        if (active) {
          const message = err instanceof Error ? err.message : "Failed to load transaction";
          setError(message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadPageData();

    return () => {
      active = false;
    };
  }, [isValidTransactionId, transactionId]);

  const availableSubcategories = useMemo(() => {
    if (!dictionaries || !form.categoryId) {
      return [];
    }

    const selectedCategoryId = Number(form.categoryId);
    return dictionaries.subcategories.filter((item) => item.categoryId === selectedCategoryId);
  }, [dictionaries, form.categoryId]);

  useEffect(() => {
    if (!form.subcategoryId) {
      return;
    }

    const selectedSubcategoryId = Number(form.subcategoryId);
    const isStillValid = availableSubcategories.some((item) => item.id === selectedSubcategoryId);
    if (!isStillValid) {
      setForm((prev) => ({ ...prev, subcategoryId: "" }));
    }
  }, [availableSubcategories, form.subcategoryId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isValidTransactionId) {
      setError("Invalid transaction id.");
      return;
    }

    const normalizedAmount = form.amount.trim();
    const parsedAmount = Number(normalizedAmount);

    if (!form.transactionDate || !normalizedAmount || !form.categoryId) {
      setError("Please fill in Date, Amount and Category.");
      return;
    }

    if (
      normalizedAmount === "-" ||
      normalizedAmount === "." ||
      normalizedAmount === "-." ||
      Number.isNaN(parsedAmount)
    ) {
      setError("Please enter a valid amount.");
      return;
    }

    setSubmitting(true);
    setError("");

    const payload: TransactionCreateRequest = {
      transactionDate: form.transactionDate,
      amount: normalizedAmount,
      currency: form.currency,
      personId: form.personId ? Number(form.personId) : null,
      categoryId: Number(form.categoryId),
      subcategoryId: form.subcategoryId ? Number(form.subcategoryId) : null,
      comment: emptyToNull(form.comment)
    };

    try {
      await updateTransaction(transactionId, payload);
      navigate("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update transaction";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateCategory(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Category name must not be blank.");
      return;
    }

    setCreatingCategory(true);
    setError("");

    try {
      const created = await createCategory({ name: trimmed });
      await loadDictionaries();
      setForm((prev) => ({ ...prev, categoryId: String(created.id), subcategoryId: "" }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create category";
      setError(message);
    } finally {
      setCreatingCategory(false);
    }
  }

  async function handleCreateSubcategory(name: string) {
    if (!form.categoryId) {
      setError("Please select category first.");
      return;
    }

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Subcategory name must not be blank.");
      return;
    }

    setCreatingSubcategory(true);
    setError("");

    try {
      const created = await createSubcategory({
        name: trimmed,
        categoryId: Number(form.categoryId)
      });
      await loadDictionaries();
      setForm((prev) => ({ ...prev, subcategoryId: String(created.id) }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create subcategory";
      setError(message);
    } finally {
      setCreatingSubcategory(false);
    }
  }

  function promptAndCreateCategory() {
    const name = window.prompt("New category name:", "");
    if (name === null) {
      return;
    }

    void handleCreateCategory(name);
  }

  function promptAndCreateSubcategory() {
    if (!form.categoryId) {
      setError("Please select category first.");
      return;
    }

    const name = window.prompt("New subcategory name:", "");
    if (name === null) {
      return;
    }

    void handleCreateSubcategory(name);
  }

  function handleAmountChange(event: ChangeEvent<HTMLInputElement>) {
    const nextAmount = normalizeAmountInput(event.target.value);
    setForm((prev) => ({ ...prev, amount: nextAmount }));
  }

  return (
    <main className="app-shell app-shell-narrow">
      <header className="app-header">
        <div>
          <h1>Edit transaction</h1>
          <p>Update an existing transaction row</p>
        </div>
        <Link to="/" className="button-link-secondary">
          Back to dashboard
        </Link>
      </header>

      {error && <div className="error-box">{error}</div>}

      <section className="card">
        {loading ? (
          <p className="empty">Loading transaction...</p>
        ) : (
          <form className="form-grid" onSubmit={handleSubmit}>
            <label>
              <span>Amount</span>
              <input
                type="text"
                inputMode="decimal"
                value={form.amount}
                onChange={handleAmountChange}
                required
              />
            </label>

            <label>
              <span>Currency</span>
              <input
                type="text"
                maxLength={3}
                value={form.currency}
                onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))}
                required
              />
            </label>

            <label>
              <span>Category</span>
              <div className="select-with-action">
                <select
                  value={form.categoryId}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, categoryId: event.target.value, subcategoryId: "" }))
                  }
                  required
                >
                  <option value="">Choose category</option>
                  {dictionaries?.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="button-link-secondary"
                  disabled={creatingCategory}
                  onClick={promptAndCreateCategory}
                >
                  {creatingCategory ? "Adding..." : "Add"}
                </button>
              </div>
            </label>

            <label>
              <span>Subcategory</span>
              <div className="select-with-action">
                <select
                  value={form.subcategoryId}
                  onChange={(event) => setForm((prev) => ({ ...prev, subcategoryId: event.target.value }))}
                  disabled={!form.categoryId || availableSubcategories.length === 0}
                >
                  <option value="">{form.categoryId ? "Choose subcategory" : "Select category first"}</option>
                  {availableSubcategories.map((subCategory) => (
                    <option key={subCategory.id} value={subCategory.id}>
                      {subCategory.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="button-link-secondary"
                  disabled={!form.categoryId || creatingSubcategory}
                  onClick={promptAndCreateSubcategory}
                >
                  {creatingSubcategory ? "Adding..." : "Add"}
                </button>
              </div>
            </label>

            <label>
              <span>Person</span>
              <select
                value={form.personId}
                onChange={(event) => setForm((prev) => ({ ...prev, personId: event.target.value }))}
              >
                <option value="">Choose person</option>
                {dictionaries?.persons.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Date</span>
              <input
                type="date"
                value={form.transactionDate}
                onChange={(event) => setForm((prev) => ({ ...prev, transactionDate: event.target.value }))}
                required
              />
            </label>

            <label className="form-grid-full">
              <span>Comment</span>
              <textarea
                rows={4}
                value={form.comment}
                onChange={(event) => setForm((prev) => ({ ...prev, comment: event.target.value }))}
              />
            </label>

            <div className="form-actions form-grid-full">
              <button type="submit" className="button-refresh" disabled={submitting}>
                {submitting ? "Saving..." : "Update transaction"}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

