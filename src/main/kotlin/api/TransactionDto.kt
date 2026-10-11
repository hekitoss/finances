package api

import kotlinx.serialization.Serializable

@Serializable
data class TransactionDto(
    val id: Int,
    val transactionDate: String,
    val amount: String,
    val currency: String,
    val person: String? = null,
    val category: String,
    val subCategory: String? = null,
    val comment: String? = null,
    val itemsCount: Int = 0
)

@Serializable
data class TransactionItemDto(
    val id: Int,
    val position: Int,
    val name: String,
    val amount: String,
    val category: String? = null,
    val subCategory: String? = null
)

@Serializable
data class TransactionFormDto(
    val id: Int,
    val transactionDate: String,
    val amount: String,
    val currency: String,
    val personId: Int? = null,
    val categoryId: Int,
    val subcategoryId: Int? = null,
    val comment: String? = null
)

@Serializable
data class TransactionCreateDto(
    val transactionDate: String,
    val amount: String,
    val currency: String = "EUR",
    val personId: Int? = null,
    val categoryId: Int,
    val subcategoryId: Int? = null,
    val comment: String? = null
)

