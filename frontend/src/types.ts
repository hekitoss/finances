export interface Transaction {
  id: number;
  transactionDate: string;
  amount: string;
  currency: string;
  person: string | null;
  category: string;
  subCategory: string | null;
  comment: string | null;
  itemsCount: number;
}

export interface TransactionItem {
  id: number;
  position: number;
  name: string;
  amount: string;
  category: string | null;
  subCategory: string | null;
}

export interface TransactionFormData {
  id: number;
  transactionDate: string;
  amount: string;
  currency: string;
  personId: number | null;
  categoryId: number;
  subcategoryId: number | null;
  comment: string | null;
}

export interface TransactionCreateRequest {
  transactionDate: string;
  amount: string;
  currency: string;
  personId: number | null;
  categoryId: number;
  subcategoryId: number | null;
  comment: string | null;
}

export interface CategoryCreateRequest {
  name: string;
}

export interface SubcategoryCreateRequest {
  name: string;
  categoryId: number;
}

export interface NamedDictionaryItem {
  id: number;
  name: string;
}

export interface SubcategoryDictionaryItem {
  id: number;
  name: string;
  categoryId: number;
}

export interface DictionariesResponse {
  categories: NamedDictionaryItem[];
  subcategories: SubcategoryDictionaryItem[];
  persons: NamedDictionaryItem[];
}

