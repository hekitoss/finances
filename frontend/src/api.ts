import type {
  CategoryCreateRequest,
  DictionariesResponse,
  NamedDictionaryItem,
  SubcategoryCreateRequest,
  SubcategoryDictionaryItem,
  Transaction,
  TransactionCreateRequest,
  TransactionFormData,
  TransactionItem
} from "./types";

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await response.json()) as { error?: string };
    if (body.error) {
      return body.error;
    }
  }

  return `${fallback}: HTTP ${response.status}`;
}

/** Inclusive date range as YYYY-MM-DD strings. */
export interface DateRange {
  from: string;
  to: string;
}

/** A null range means "all time". */
export async function fetchTransactions(range?: DateRange | null): Promise<Transaction[]> {
  const searchParams = new URLSearchParams();

  if (range) {
    searchParams.set("from", range.from);
    searchParams.set("to", range.to);
  }

  const query = searchParams.toString();
  const url = query ? `/api/transactions?${query}` : "/api/transactions";

  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to load transactions"));
  }

  const data = (await response.json()) as Transaction[];
  return data;
}

function readFileName(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) {
    return fallback;
  }

  const match = contentDisposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? fallback;
}

export async function exportTransactionsExcel(range: DateRange | null): Promise<void> {
  const query = range ? `?${new URLSearchParams({ from: range.from, to: range.to }).toString()}` : "";

  const response = await fetch(`/api/transactions/export${query}`, {
    headers: {
      Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to export transactions"));
  }

  const blob = await response.blob();
  const fallbackFileName = range ? `transactions-${range.from}_${range.to}.xlsx` : "transactions-all.xlsx";
  const fileName = readFileName(response.headers.get("content-disposition"), fallbackFileName);
  const downloadUrl = URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(downloadUrl);
  }
}

export async function fetchTransaction(id: number): Promise<TransactionFormData> {
  const response = await fetch(`/api/transactions/${id}`, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to load transaction"));
  }

  const data = (await response.json()) as TransactionFormData;
  return data;
}

export async function fetchTransactionItems(id: number): Promise<TransactionItem[]> {
  const response = await fetch(`/api/transactions/${id}/items`, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to load receipt items"));
  }

  const data = (await response.json()) as TransactionItem[];
  return data;
}

export async function fetchDictionaries(): Promise<DictionariesResponse> {
  const response = await fetch("/api/dictionaries", {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to load dictionaries"));
  }

  const data = (await response.json()) as DictionariesResponse;
  return data;
}

export async function createTransaction(payload: TransactionCreateRequest): Promise<Transaction> {
  const response = await fetch("/api/transactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to create transaction"));
  }

  const data = (await response.json()) as Transaction;
  return data;
}

export async function updateTransaction(id: number, payload: TransactionCreateRequest): Promise<Transaction> {
  const response = await fetch(`/api/transactions/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to update transaction"));
  }

  const data = (await response.json()) as Transaction;
  return data;
}

export async function createCategory(payload: CategoryCreateRequest): Promise<NamedDictionaryItem> {
  const response = await fetch("/api/categories", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to create category"));
  }

  const data = (await response.json()) as NamedDictionaryItem;
  return data;
}

export async function createSubcategory(payload: SubcategoryCreateRequest): Promise<SubcategoryDictionaryItem> {
  const response = await fetch("/api/subcategories", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to create subcategory"));
  }

  const data = (await response.json()) as SubcategoryDictionaryItem;
  return data;
}

export async function deleteTransaction(id: number): Promise<void> {
  const response = await fetch(`/api/transactions/${id}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to delete transaction"));
  }
}
