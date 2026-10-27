import { Fragment, useEffect, useState } from "react";
import type { DictionariesResponse, Transaction, TransactionItem } from "../types";
import { deleteTransaction, fetchTransactionItems } from "../api";
import ColumnFilterDropdown, { isFilterActive, type ColumnFilter } from "./ColumnFilterDropdown";
import TransactionEditForm from "./TransactionEditForm";
import TransactionEditRow from "./TransactionEditRow";

export interface TransactionsTableFilters {
  category: ColumnFilter;
  subcategory: ColumnFilter;
  person: ColumnFilter;
  /** Shows rows that have any of the selected tags. */
  tags?: ColumnFilter;
  /** Single-choice currency filter shown on the Amount column; not affected by Clear filters. */
  currency?: ColumnFilter;
  onClear: () => void;
}

interface TransactionsTableProps {
  transactions: Transaction[];
  onTransactionDeleted: (id: number) => void;
  filters?: TransactionsTableFilters;
  /** Show the Edit/Delete actions on each row. */
  editMode?: boolean;
  /** Used by the inline editor; loaded by the page when edit mode is turned on. */
  dictionaries?: DictionariesResponse | null;
  onDictionariesChanged?: () => Promise<unknown>;
  onTransactionUpdated?: () => void;
}

// Must match the breakpoint in styles.css where the table is swapped for cards.
const NARROW_QUERY = "(max-width: 640px)";

/** Only one of the table and the card list is visible, so the editor is mounted in that one only. */
function useIsNarrow(): boolean {
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);

  useEffect(() => {
    const media = window.matchMedia(NARROW_QUERY);
    const handleChange = () => setIsNarrow(media.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  return isNarrow;
}

type ItemsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; items: TransactionItem[] };

function formatAmount(amount: string, currency: string): string {
  const parsed = Number.parseFloat(amount);
  if (Number.isNaN(parsed)) {
    return `${amount} ${currency}`;
  }
  return `${parsed.toFixed(2)} ${currency}`;
}

async function handleDelete(id: number, onDeleted: (id: number) => void) {
  if (!confirm("Are you sure you want to delete this transaction?")) {
    return;
  }

  try {
    await deleteTransaction(id);
    onDeleted(id);
  } catch (error) {
    alert(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

function amountClass(amount: string): string {
  return Number.parseFloat(amount) < 0 ? "amount-negative" : "amount-positive";
}

function RowActions({
  id,
  editing,
  onEdit,
  onDeleted
}: {
  id: number;
  editing: boolean;
  onEdit: () => void;
  onDeleted: (id: number) => void;
}) {
  return (
    <div className="table-actions">
      <button type="button" onClick={onEdit} className="edit-btn" aria-pressed={editing}>
        {editing ? "Close" : "Edit"}
      </button>
      <button onClick={() => handleDelete(id, onDeleted)} className="delete-btn">
        Delete
      </button>
    </div>
  );
}

function FilterHeader({
  label,
  filter,
  single,
  className
}: {
  label: string;
  filter?: ColumnFilter;
  single?: boolean;
  className?: string;
}) {
  return (
    <th className={className}>{filter ? <ColumnFilterDropdown label={label} filter={filter} single={single} /> : label}</th>
  );
}

function TagChips({ tags }: { tags: string[] }) {
  return (
    <span className="tag-list">
      {tags.map((tag) => (
        <span key={tag} className="tag-chip">
          {tag}
        </span>
      ))}
    </span>
  );
}

function ItemsToggle({ count, expanded, onToggle }: { count: number; expanded: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="items-toggle" aria-expanded={expanded} onClick={onToggle}>
      {expanded ? "▾" : "▸"} {count} items
    </button>
  );
}

function ReceiptItems({ state, currency }: { state: ItemsState | undefined; currency: string }) {
  if (!state || state.status === "loading") {
    return <p className="receipt-status">Loading items…</p>;
  }

  if (state.status === "error") {
    return <p className="receipt-status receipt-error">Error: {state.message}</p>;
  }

  return (
    <table className="receipt-items">
      <tbody>
        {state.items.map((item) => (
          <tr key={item.id}>
            <td>{item.name}</td>
            <td className="receipt-category">
              {[item.category, item.subCategory].filter(Boolean).join(" / ") || "-"}
            </td>
            <td className="table-amount">{formatAmount(item.amount, currency)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function TransactionsTable({
  transactions,
  onTransactionDeleted,
  filters,
  editMode = false,
  dictionaries = null,
  onDictionariesChanged = async () => {},
  onTransactionUpdated = () => {}
}: TransactionsTableProps) {
  const columnCount = editMode ? 8 : 7;
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [itemsById, setItemsById] = useState<Record<number, ItemsState>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const isNarrow = useIsNarrow();

  useEffect(() => {
    if (!editMode) {
      setEditingId(null);
    }
  }, [editMode]);

  function toggleEditing(id: number) {
    setEditingId((prev) => (prev === id ? null : id));
  }

  const editorProps = (id: number) => ({
    transactionId: id,
    dictionaries,
    onDictionariesChanged,
    onSaved: () => {
      setEditingId(null);
      onTransactionUpdated();
    },
    onCancel: () => setEditingId(null)
  });

  async function loadItems(id: number) {
    setItemsById((prev) => ({ ...prev, [id]: { status: "loading" } }));
    try {
      const items = await fetchTransactionItems(id);
      setItemsById((prev) => ({ ...prev, [id]: { status: "loaded", items } }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setItemsById((prev) => ({ ...prev, [id]: { status: "error", message } }));
    }
  }

  function toggleItems(id: number) {
    const isExpanded = expandedIds.has(id);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (isExpanded) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

    // Items are fetched on first expand and cached; retry if the previous attempt failed.
    const current = itemsById[id];
    if (!isExpanded && (!current || current.status === "error")) {
      void loadItems(id);
    }
  }

  return (
    <section className="card">
      <div className="card-title-row">
        <h2>Transactions</h2>
        {filters &&
          (isFilterActive(filters.category) ||
            isFilterActive(filters.subcategory) ||
            isFilterActive(filters.person) ||
            (filters.tags && isFilterActive(filters.tags))) && (
          <button type="button" className="clear-filters" onClick={filters.onClear}>
            Clear filters
          </button>
        )}
      </div>

      {/* Narrow screens have no table header, so the column filters are shown here instead. */}
      {filters && (
        <div className="mobile-filters">
          <ColumnFilterDropdown label="Category" filter={filters.category} />
          <ColumnFilterDropdown label="Subcategory" filter={filters.subcategory} />
          <ColumnFilterDropdown label="Person" filter={filters.person} />
          {filters.tags && <ColumnFilterDropdown label="Tags" filter={filters.tags} />}
          {filters.currency && <ColumnFilterDropdown label="Amount" filter={filters.currency} single />}
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="table-date">Date</th>
              <FilterHeader label="Category" filter={filters?.category} />
              <FilterHeader label="Subcategory" filter={filters?.subcategory} />
              <FilterHeader label="Person" filter={filters?.person} />
              <FilterHeader label="Amount" filter={filters?.currency} single className="table-amount" />
              <FilterHeader label="Tags" filter={filters?.tags} />
              <th>Comment</th>
              {editMode && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="empty">
                  No transactions found.
                </td>
              </tr>
            ) : (
              transactions.map((transaction) => {
                const isExpanded = expandedIds.has(transaction.id);
                const isEditing = editMode && !isNarrow && editingId === transaction.id;
                return (
                  <Fragment key={transaction.id}>
                    {isEditing ? (
                      <TransactionEditRow columnCount={columnCount} {...editorProps(transaction.id)} />
                    ) : (
                      <tr className={isExpanded ? "row-expanded" : undefined}>
                        <td className="table-date">{transaction.transactionDate}</td>
                        <td>{transaction.category}</td>
                        <td>{transaction.subCategory ?? "-"}</td>
                        <td>{transaction.person ?? "-"}</td>
                        <td className="table-amount">{formatAmount(transaction.amount, transaction.currency)}</td>
                        <td>{transaction.tags.length > 0 ? <TagChips tags={transaction.tags} /> : "-"}</td>
                        <td>
                          {transaction.comment ?? "-"}
                          {transaction.itemsCount > 0 && (
                            <ItemsToggle
                              count={transaction.itemsCount}
                              expanded={isExpanded}
                              onToggle={() => toggleItems(transaction.id)}
                            />
                          )}
                        </td>
                        {editMode && (
                          <td>
                            <RowActions
                              id={transaction.id}
                              editing={false}
                              onEdit={() => toggleEditing(transaction.id)}
                              onDeleted={onTransactionDeleted}
                            />
                          </td>
                        )}
                      </tr>
                    )}
                    {isExpanded && (
                      <tr className="receipt-row">
                        <td colSpan={columnCount}>
                          <ReceiptItems state={itemsById[transaction.id]} currency={transaction.currency} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Narrow screens: the same rows as stacked cards instead of a wide table. */}
      <ul className="transaction-cards">
        {transactions.length === 0 ? (
          <li className="empty">No transactions found.</li>
        ) : (
          transactions.map((transaction) => {
            const isExpanded = expandedIds.has(transaction.id);
            const isEditing = editMode && isNarrow && editingId === transaction.id;
            return (
              <li key={transaction.id} className={isEditing ? "transaction-card transaction-card-editing" : "transaction-card"}>
                <div className="transaction-card-top">
                  <div className="transaction-card-category">
                    {transaction.category}
                    {transaction.subCategory && <span> · {transaction.subCategory}</span>}
                  </div>
                  <div className={`transaction-card-amount ${amountClass(transaction.amount)}`}>
                    {formatAmount(transaction.amount, transaction.currency)}
                  </div>
                </div>
                <div className="transaction-card-meta">
                  {[transaction.transactionDate, transaction.person].filter(Boolean).join(" · ")}
                </div>
                {transaction.tags.length > 0 && (
                  <div className="transaction-card-tags">
                    <TagChips tags={transaction.tags} />
                  </div>
                )}
                {(transaction.comment || transaction.itemsCount > 0) && (
                  <div className="transaction-card-comment">
                    {transaction.comment}
                    {transaction.itemsCount > 0 && (
                      <ItemsToggle
                        count={transaction.itemsCount}
                        expanded={isExpanded}
                        onToggle={() => toggleItems(transaction.id)}
                      />
                    )}
                  </div>
                )}
                {isExpanded && (
                  <div className="transaction-card-items">
                    <ReceiptItems state={itemsById[transaction.id]} currency={transaction.currency} />
                  </div>
                )}
                {editMode && (
                  <RowActions
                    id={transaction.id}
                    editing={isEditing}
                    onEdit={() => toggleEditing(transaction.id)}
                    onDeleted={onTransactionDeleted}
                  />
                )}
                {isEditing && <div className="transaction-card-edit"><TransactionEditForm {...editorProps(transaction.id)} /></div>}
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
