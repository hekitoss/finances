package model

import java.math.BigDecimal

/** A line item of a transaction, e.g. one product on a receipt. */
data class TransactionItem(
    val name: String,
    val amount: BigDecimal,
    val categoryId: Int?,
    val subcategoryId: Int?
)
