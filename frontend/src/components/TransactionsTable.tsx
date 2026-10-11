import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import type { Transaction, TransactionItem } from "../types";
import { deleteTransaction, fetchTransactionItems } from "../api";

interface TransactionsTableProps {
  transactions: Transaction[];
  onTransactionDeleted: (id: number) => void;
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

export default function TransactionsTable({ transactions, onTransactionDeleted }: TransactionsTableProps) {
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
      <h2>Transactions</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="table-date">Date</th>
              <th>Category</th>
              <th>Subcategory</th>
              <th>Person</th>
              <th className="table-amount">Amount</th>
              <th>Comment</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty">
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
                          <button
                            type="button"
                            className="items-toggle"
                            aria-expanded={isExpanded}
                            onClick={() => toggleItems(transaction.id)}
                          >
                            {isExpanded ? "▾" : "▸"} {transaction.itemsCount} items
                          </button>
                        )}
                      </td>
                      <td>
                        <div className="table-actions">
                          <Link to={`/transactions/${transaction.id}/edit`} className="edit-btn">
                            Edit
                          </Link>
                          <button
                            onClick={() => handleDelete(transaction.id, onTransactionDeleted)}
                            className="delete-btn"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="receipt-row">
                        <td colSpan={7}>
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
    </section>
  );
}
