package model

import java.math.BigDecimal
import java.time.LocalDate

data class Transaction(
    val id: Int,
    val transactionDate: LocalDate,
    val amount: BigDecimal,
    val currency: String,
    val personId: Int?,
    val person: String?,
    val categoryId: Int,
    val category: String,
    val subcategoryId: Int?,
    val subCategory: String?,
    val comment: String?
)

