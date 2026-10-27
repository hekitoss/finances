import { FormEvent, useLayoutEffect, useRef } from "react";
import ColumnFilterDropdown from "./ColumnFilterDropdown";
import { useTransactionEditor, type TransactionEditorOptions } from "./TransactionEditForm";

interface TransactionEditRowProps extends TransactionEditorOptions {
  columnCount: number;
  onCancel: () => void;
}

// Picking this option in a select asks for a new name instead of selecting it.
const NEW_OPTION = "__new__";

/**
 * Edits a transaction in its own table row: every cell becomes a field. The <form> sits in the
 * Action cell (a form cannot wrap a <tr>), and the fields join it through their form attribute.
 */
export default function TransactionEditRow({ columnCount, onCancel, ...options }: TransactionEditRowProps) {
  const {
    loading,
    submitting,
    creatingCategory,
    creatingSubcategory,
    creatingTag,
    error,
    form,
    setForm,
    availableSubcategories,
    submit,
    promptAndCreateCategory,
    promptAndCreateSubcategory,
    promptAndCreateTag,
    handleAmountChange
  } = useTransactionEditor(options);
  const { transactionId, dictionaries } = options;
  const formId = `edit-transaction-${transactionId}`;
  const commentRef = useRef<HTMLTextAreaElement>(null);

  // The comment box grows with its text instead of scrolling inside one line.
  useLayoutEffect(() => {
    const textarea = commentRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight + 2}px`;
  }, [form.comment, loading]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  if (loading) {
    return (
      <tr className="edit-row">
        <td colSpan={columnCount} className="receipt-status">
          Loading transaction…
        </td>
      </tr>
    );
  }

  const tags = dictionaries?.tags ?? [];
  const selectedTagNames = tags.filter((tag) => form.tagIds.includes(tag.id)).map((tag) => tag.name);

  return (
    <>
      <tr className="edit-row">
        <td className="table-date">
          <input
            form={formId}
            type="date"
            aria-label="Date"
            value={form.transactionDate}
            onChange={(event) => setForm((prev) => ({ ...prev, transactionDate: event.target.value }))}
            required
          />
        </td>
        <td>
          <select
            form={formId}
            aria-label="Category"
            value={form.categoryId}
            disabled={creatingCategory}
            onChange={(event) => {
              const value = event.target.value;
              if (value === NEW_OPTION) {
                promptAndCreateCategory();
                return;
              }
              setForm((prev) => ({ ...prev, categoryId: value, subcategoryId: "" }));
            }}
            required
          >
            <option value="">Category</option>
            {dictionaries?.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
            <option value={NEW_OPTION}>+ New category…</option>
          </select>
        </td>
        <td>
          <select
            form={formId}
            aria-label="Subcategory"
            value={form.subcategoryId}
            disabled={!form.categoryId || creatingSubcategory}
            onChange={(event) => {
              const value = event.target.value;
              if (value === NEW_OPTION) {
                promptAndCreateSubcategory();
                return;
              }
              setForm((prev) => ({ ...prev, subcategoryId: value }));
            }}
          >
            <option value="">-</option>
            {availableSubcategories.map((subCategory) => (
              <option key={subCategory.id} value={subCategory.id}>
                {subCategory.name}
              </option>
            ))}
            <option value={NEW_OPTION}>+ New subcategory…</option>
          </select>
        </td>
        <td>
          <select
            form={formId}
            aria-label="Person"
            value={form.personId}
            onChange={(event) => setForm((prev) => ({ ...prev, personId: event.target.value }))}
          >
            <option value="">-</option>
            {dictionaries?.persons.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </td>
        <td className="table-amount">
          <div className="edit-amount">
            <input
              form={formId}
              type="text"
              inputMode="decimal"
              aria-label="Amount"
              value={form.amount}
              onChange={handleAmountChange}
              required
            />
            <input
              form={formId}
              type="text"
              maxLength={3}
              aria-label="Currency"
              className="edit-currency"
              value={form.currency}
              onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))}
              required
            />
          </div>
        </td>
        <td>
          <ColumnFilterDropdown
            label={creatingTag ? "Adding..." : selectedTagNames.length > 0 ? selectedTagNames.join(", ") : "Tags"}
            filter={{
              selected: selectedTagNames,
              options: tags.map((tag) => tag.name),
              onChange: (names) =>
                setForm((prev) => ({ ...prev, tagIds: tags.filter((tag) => names.includes(tag.name)).map((tag) => tag.id) }))
            }}
            onCreate={promptAndCreateTag}
            createLabel="+ New tag"
          />
        </td>
        <td className="edit-comment-cell">
          <textarea
            ref={commentRef}
            form={formId}
            rows={1}
            aria-label="Comment"
            placeholder="Comment"
            value={form.comment}
            onChange={(event) => setForm((prev) => ({ ...prev, comment: event.target.value }))}
          />
        </td>
        <td>
          <form id={formId} className="table-actions" onSubmit={handleSubmit}>
            <button type="submit" className="edit-btn edit-save" disabled={submitting}>
              {submitting ? "Saving..." : "Save"}
            </button>
            <button type="button" className="edit-btn" disabled={submitting} onClick={onCancel}>
              Cancel
            </button>
          </form>
        </td>
      </tr>
      {error && (
        <tr className="edit-row edit-error-row">
          <td colSpan={columnCount}>
            <div className="error-box">{error}</div>
          </td>
        </tr>
      )}
    </>
  );
}
