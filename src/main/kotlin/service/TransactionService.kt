package service

import api.TransactionCreateDto
import dao.TransactionDao
import model.Transaction
import java.math.BigDecimal
import java.time.LocalDate

class TransactionService(
    private val dao: TransactionDao,
    private val dictionaryService: DictionaryService
) {
    private data class TransactionInput(
        val transactionDate: LocalDate,
        val amount: BigDecimal,
        val currency: String,
        val personId: Int?,
        val categoryId: Int,
        val subcategoryId: Int?,
        val comment: String?
    )

    fun getAllTransactions(): List<Transaction> = dao.findAll()

    fun getTransactionsByMonthYear(month: Int, year: Int): List<Transaction> {
        require(month in 1..12) { "Month must be in range 1..12" }
        require(year in 1900..3000) { "Year must be in range 1900..3000" }

        val start = LocalDate.of(year, month, 1)
        val end = start.plusMonths(1)
        return dao.findByDateRange(startDateInclusive = start, endDateExclusive = end)
    }

    fun getTransaction(id: Int): Transaction? {
        require(id > 0) { "Transaction id must be positive" }
        return dao.findById(id)
    }

    fun createTransaction(create: TransactionCreateDto): Transaction {
        val input = normalizeInput(create)

        return dao.insert(
            transactionDate = input.transactionDate,
            amount = input.amount,
            currency = input.currency,
            personId = input.personId,
            categoryId = input.categoryId,
            subcategoryId = input.subcategoryId,
            comment = input.comment
        )
    }

    fun updateTransaction(id: Int, update: TransactionCreateDto): Transaction? {
        require(id > 0) { "Transaction id must be positive" }
        val input = normalizeInput(update)

        return dao.update(
            id = id,
            transactionDate = input.transactionDate,
            amount = input.amount,
            currency = input.currency,
            personId = input.personId,
            categoryId = input.categoryId,
            subcategoryId = input.subcategoryId,
            comment = input.comment
        )
    }

    fun deleteTransaction(id: Int): Boolean {
        require(id > 0) { "Transaction id must be positive" }
        return dao.delete(id)
    }

    private fun normalizeInput(create: TransactionCreateDto): TransactionInput {
        val date = LocalDate.parse(create.transactionDate)
        val amount = BigDecimal(create.amount)
        val currency = create.currency.trim().uppercase()
        val categoryId = create.categoryId
        val personId = create.personId
        val subcategoryId = create.subcategoryId
        val comment = create.comment?.trim()?.takeIf { it.isNotEmpty() }

        require(categoryId > 0) { "Category is required" }
        require(dictionaryService.categoryExists(categoryId)) { "Unknown category id: $categoryId" }

        if (personId != null) {
            require(personId > 0) { "Invalid person id: $personId" }
            require(dictionaryService.personExists(personId)) { "Unknown person id: $personId" }
        }

        if (subcategoryId != null) {
            require(subcategoryId > 0) { "Invalid subcategory id: $subcategoryId" }
            require(dictionaryService.subcategoryExists(categoryId, subcategoryId)) {
                "Unknown subcategory id '$subcategoryId' for category id '$categoryId'"
            }
        }

        return TransactionInput(
            transactionDate = date,
            amount = amount,
            currency = currency,
            personId = personId,
            categoryId = categoryId,
            subcategoryId = subcategoryId,
            comment = comment
        )
    }
}
