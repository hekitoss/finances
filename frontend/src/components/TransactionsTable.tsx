import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import type { Transaction, TransactionItem } from "../types";
import { deleteTransaction, fetchTransactionItems } from "../api";
import ColumnFilterDropdown, { isFilterActive, type ColumnFilter } from "./ColumnFilterDropdown";

export interface TransactionsTableFilters {
  category: ColumnFilter;
  subcategory: ColumnFilter;
  person: ColumnFilter;
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

function RowActions({ id, onDeleted }: { id: number; onDeleted: (id: number) => void }) {
  return (
    <div className="table-actions">
      <Link to={`/transactions/${id}/edit`} className="edit-btn">
        Edit
      </Link>
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

export default function TransactionsTable({ transactions, onTransactionDeleted, filters, editMode = false }: TransactionsTableProps) {
  const columnCount = editMode ? 7 : 6;
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [itemsById, setItemsById] = useState<Record<number, ItemsState>>({});

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
            isFilterActive(filters.person)) && (
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
                return (
                  <Fragment key={transaction.id}>
                    <tr className={isExpanded ? "row-expanded" : undefined}>
                      <td className="table-date">{transaction.transactionDate}</td>
                      <td>{transaction.category}</td>
                      <td>{transaction.subCategory ?? "-"}</td>
                      <td>{transaction.person ?? "-"}</td>
                      <td className="table-amount">{formatAmount(transaction.amount, transaction.currency)}</td>
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
                          <RowActions id={transaction.id} onDeleted={onTransactionDeleted} />
                        </td>
                      )}
                    </tr>
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
            return (
              <li key={transaction.id} className="transaction-card">
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
                {editMode && <RowActions id={transaction.id} onDeleted={onTransactionDeleted} />}
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
