package model

import java.math.BigDecimal

/** A line item of a transaction, e.g. one product on a receipt. */
data class TransactionItem(
    val name: String,
    val amount: BigDecimal,
    val categoryId: Int?,
    val subcategoryId: Int?
)

/** A stored line item with resolved category names, for display. */
data class TransactionItemDetails(
    val id: Int,
    val position: Int,
    val name: String,
    val amount: BigDecimal,
    val category: String?,
    val subCategory: String?
)
