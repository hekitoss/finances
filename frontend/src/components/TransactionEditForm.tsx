import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { createCategory, createSubcategory, createTag, fetchTransaction, updateTransaction } from "../api";
import type { DictionariesResponse, TransactionCreateRequest } from "../types";
import TagPicker from "./TagPicker";

export interface TransactionEditorOptions {
  transactionId: number;
  dictionaries: DictionariesResponse | null;
  /** Reloads the dictionaries after a category, subcategory or tag is added from the editor. */
  onDictionariesChanged: () => Promise<unknown>;
  onSaved: () => void;
}

interface TransactionEditFormProps extends TransactionEditorOptions {
  onCancel: () => void;
}

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

/** Form state and actions shared by the editor in a table row (desktop) and in a card (phones). */
export function useTransactionEditor({ transactionId, dictionaries, onDictionariesChanged, onSaved }: TransactionEditorOptions) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [creatingSubcategory, setCreatingSubcategory] = useState(false);
  const [creatingTag, setCreatingTag] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    transactionDate: "",
    amount: "",
    currency: "EUR",
    personId: "",
    categoryId: "",
    subcategoryId: "",
    comment: "",
    tagIds: [] as number[]
  });

  // The table rows carry names only, so the ids for the selects come from the single-transaction endpoint.
  useEffect(() => {
    let active = true;

    async function loadTransaction() {
      setLoading(true);
      setError("");

      try {
        const transaction = await fetchTransaction(transactionId);
        if (!active) {
          return;
        }

        setForm({
          transactionDate: transaction.transactionDate,
          amount: transaction.amount,
          currency: transaction.currency,
          personId: transaction.personId ? String(transaction.personId) : "",
          categoryId: String(transaction.categoryId),
          subcategoryId: transaction.subcategoryId ? String(transaction.subcategoryId) : "",
          comment: transaction.comment ?? "",
          tagIds: transaction.tagIds ?? []
        });
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load transaction");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadTransaction();

    return () => {
      active = false;
    };
  }, [transactionId]);

  const availableSubcategories = useMemo(() => {
    if (!dictionaries || !form.categoryId) {
      return [];
    }

    const selectedCategoryId = Number(form.categoryId);
    return dictionaries.subcategories.filter((item) => item.categoryId === selectedCategoryId);
  }, [dictionaries, form.categoryId]);

  useEffect(() => {
    // Wait for the dictionaries, otherwise the loaded subcategory would be cleared before they arrive.
    if (!dictionaries || !form.subcategoryId) {
      return;
    }

    const selectedSubcategoryId = Number(form.subcategoryId);
    const isStillValid = availableSubcategories.some((item) => item.id === selectedSubcategoryId);
    if (!isStillValid) {
      setForm((prev) => ({ ...prev, subcategoryId: "" }));
    }
  }, [dictionaries, availableSubcategories, form.subcategoryId]);

  async function submit() {
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
      comment: emptyToNull(form.comment),
      tagIds: form.tagIds
    };

    try {
      await updateTransaction(transactionId, payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update transaction");
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
      await onDictionariesChanged();
      setForm((prev) => ({ ...prev, categoryId: String(created.id), subcategoryId: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create category");
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
      await onDictionariesChanged();
      setForm((prev) => ({ ...prev, subcategoryId: String(created.id) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create subcategory");
    } finally {
      setCreatingSubcategory(false);
    }
  }

  async function handleCreateTag(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Tag name must not be blank.");
      return;
    }

    setCreatingTag(true);
    setError("");

    try {
      const created = await createTag({ name: trimmed });
      await onDictionariesChanged();
      setForm((prev) => ({ ...prev, tagIds: [...prev.tagIds, created.id] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tag");
    } finally {
      setCreatingTag(false);
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

  function promptAndCreateTag() {
    const name = window.prompt("New tag name:", "");
    if (name === null) {
      return;
    }

    void handleCreateTag(name);
  }

  function handleAmountChange(event: ChangeEvent<HTMLInputElement>) {
    const nextAmount = normalizeAmountInput(event.target.value);
    setForm((prev) => ({ ...prev, amount: nextAmount }));
  }

  return {
    loading,
    submitting,
    creatingCategory,
    creatingSubcategory,
    creatingTag,
    error,
    setError,
    form,
    setForm,
    availableSubcategories,
    submit,
    promptAndCreateCategory,
    promptAndCreateSubcategory,
    promptAndCreateTag,
    handleAmountChange
  };
}

/** Inline editor for one transaction, shown inside its card on narrow screens. */
export default function TransactionEditForm({ onCancel, ...options }: TransactionEditFormProps) {
  const {
    loading,
    submitting,
    creatingCategory,
    creatingSubcategory,
    error,
    setError,
    form,
    setForm,
    availableSubcategories,
    submit,
    promptAndCreateCategory,
    promptAndCreateSubcategory,
    handleAmountChange
  } = useTransactionEditor(options);
  const { dictionaries, onDictionariesChanged } = options;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  if (loading) {
    return <p className="receipt-status">Loading transaction…</p>;
  }

  return (
    <form className="form-grid inline-edit-form" onSubmit={handleSubmit}>
      {error && <div className="error-box form-grid-full">{error}</div>}

      <label>
        <span>Amount</span>
        <input type="text" inputMode="decimal" value={form.amount} onChange={handleAmountChange} required />
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
            onChange={(event) => setForm((prev) => ({ ...prev, categoryId: event.target.value, subcategoryId: "" }))}
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
        <select value={form.personId} onChange={(event) => setForm((prev) => ({ ...prev, personId: event.target.value }))}>
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

      <TagPicker
        tags={dictionaries?.tags ?? []}
        selectedIds={form.tagIds}
        onChange={(tagIds) => setForm((prev) => ({ ...prev, tagIds }))}
        onTagCreated={onDictionariesChanged}
        onError={setError}
      />

      <label className="form-grid-full">
        <span>Comment</span>
        <textarea
          rows={3}
          value={form.comment}
          onChange={(event) => setForm((prev) => ({ ...prev, comment: event.target.value }))}
        />
      </label>

      <div className="form-actions form-grid-full">
        <button type="button" className="button-link-secondary" disabled={submitting} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button-refresh" disabled={submitting}>
          {submitting ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
