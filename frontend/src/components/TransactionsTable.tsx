import { Link } from "react-router-dom";
import type { Transaction } from "../types";
import { deleteTransaction } from "../api";

interface TransactionsTableProps {
  transactions: Transaction[];
  onTransactionDeleted: (id: number) => void;
}

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

export default function TransactionsTable({ transactions, onTransactionDeleted }: TransactionsTableProps) {
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
              transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td className="table-date">{transaction.transactionDate}</td>
                  <td>{transaction.category}</td>
                  <td>{transaction.subCategory ?? "-"}</td>
                  <td>{transaction.person ?? "-"}</td>
                  <td className="table-amount">{formatAmount(transaction.amount, transaction.currency)}</td>
                  <td>{transaction.comment ?? "-"}</td>
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
