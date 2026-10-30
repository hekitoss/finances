package service

import api.TransactionCreateDto
import dao.TransactionDao
import model.Transaction
import model.TransactionItem
import model.TransactionItemDetails
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import java.io.ByteArrayOutputStream
import java.math.BigDecimal
import java.time.LocalDate

class TransactionService(
    private val dao: TransactionDao,
    private val dictionaryService: DictionaryService,
    private val exchangeRates: ExchangeRateService = ExchangeRateService()
) {
    private data class TransactionInput(
        val transactionDate: LocalDate,
        val amount: BigDecimal,
        val currency: String,
        val personId: Int?,
        val categoryId: Int,
        val subcategoryId: Int?,
        val comment: String?,
        val tagIds: List<Int>?
    )

    fun getAllTransactions(): List<Transaction> = dao.findAll()

    fun getTransactionsByMonthYear(month: Int, year: Int): List<Transaction> {
        require(month in 1..12) { "Month must be in range 1..12" }
        require(year in 1900..3000) { "Year must be in range 1900..3000" }

        val start = LocalDate.of(year, month, 1)
        val end = start.plusMonths(1)
        return dao.findByDateRange(startDateInclusive = start, endDateExclusive = end)
    }

    fun getTransactionsByDateRange(from: LocalDate, to: LocalDate): List<Transaction> {
        require(!to.isBefore(from)) { "'to' date must not be before 'from' date" }
        return dao.findByDateRange(startDateInclusive = from, endDateExclusive = to.plusDays(1))
    }

    fun exportTransactionsByMonthYearToExcel(month: Int, year: Int): ByteArray =
        exportToExcel(getTransactionsByMonthYear(month = month, year = year))

    fun exportTransactionsByDateRangeToExcel(from: LocalDate, to: LocalDate): ByteArray =
        exportToExcel(getTransactionsByDateRange(from = from, to = to))

    fun exportAllTransactionsToExcel(): ByteArray = exportToExcel(getAllTransactions())

    private fun exportToExcel(transactions: List<Transaction>): ByteArray {
        val workbook = XSSFWorkbook()
        val sheet = workbook.createSheet("Transactions")

        val headerRow = sheet.createRow(0)
        val headers = listOf("Date", "Amount", "Currency", "Amount EUR", "Person", "Category", "Subcategory", "Comment", "Tags")
        headers.forEachIndexed { index, header ->
            headerRow.createCell(index).setCellValue(header)
        }

        transactions.forEachIndexed { index, transaction ->
            val row = sheet.createRow(index + 1)
            row.createCell(0).setCellValue(transaction.transactionDate.toString())
            row.createCell(1).setCellValue(transaction.amount.toPlainString())
            row.createCell(2).setCellValue(transaction.currency)
            row.createCell(3).setCellValue(transaction.amountEur?.toPlainString() ?: "")
            row.createCell(4).setCellValue(transaction.person ?: "")
            row.createCell(5).setCellValue(transaction.category)
            row.createCell(6).setCellValue(transaction.subCategory ?: "")
            row.createCell(7).setCellValue(transaction.comment ?: "")
            row.createCell(8).setCellValue(transaction.tags.joinToString(", "))
        }

        repeat(headers.size) { sheet.autoSizeColumn(it) }

        return workbook.use { wb ->
            ByteArrayOutputStream().use { outputStream ->
                wb.write(outputStream)
                outputStream.toByteArray()
            }
        }
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
            comment = input.comment,
            amountEur = toEur(input),
            tagIds = input.tagIds.orEmpty()
        )
    }

    fun getTransactionItems(transactionId: Int): List<TransactionItemDetails> {
        require(transactionId > 0) { "Transaction id must be positive" }
        return dao.findItems(transactionId)
    }

    /** Creates a transaction (e.g. a receipt total) with its line items, atomically. */
    fun createTransactionWithItems(create: TransactionCreateDto, items: List<TransactionItem>): Transaction {
        val input = normalizeInput(create)
        require(items.isNotEmpty()) { "Items must not be empty" }

        val normalizedItems = items.map { item ->
            val name = item.name.trim()
            require(name.isNotEmpty()) { "Item name must not be blank" }
            if (item.categoryId != null) {
                require(dictionaryService.categoryExists(item.categoryId)) { "Unknown category id: ${item.categoryId}" }
            }
            val subcategoryId = item.subcategoryId?.takeIf { id ->
                item.categoryId != null && dictionaryService.subcategoryExists(item.categoryId, id)
            }
            item.copy(name = name.take(500), subcategoryId = subcategoryId)
        }

        return dao.insertWithItems(
            transactionDate = input.transactionDate,
            amount = input.amount,
            currency = input.currency,
            personId = input.personId,
            categoryId = input.categoryId,
            subcategoryId = input.subcategoryId,
            comment = input.comment,
            amountEur = toEur(input),
            items = normalizedItems,
            tagIds = input.tagIds.orEmpty()
        )
    }

    fun updateTransaction(id: Int, update: TransactionCreateDto): Transaction? {
        require(id > 0) { "Transaction id must be positive" }
        val input = normalizeInput(update)
        val existing = dao.findById(id) ?: return null
        // The rate is looked up again only when something it depends on changed.
        val amountEur = if (
            existing.amountEur != null &&
            existing.amount.compareTo(input.amount) == 0 &&
            existing.currency == input.currency &&
            existing.transactionDate == input.transactionDate
        ) {
            existing.amountEur
        } else {
            toEur(input)
        }

        return dao.update(
            id = id,
            transactionDate = input.transactionDate,
            amount = input.amount,
            currency = input.currency,
            personId = input.personId,
            categoryId = input.categoryId,
            subcategoryId = input.subcategoryId,
            comment = input.comment,
            amountEur = amountEur,
            tagIds = input.tagIds
        )
    }

    fun deleteTransaction(id: Int): Boolean {
        require(id > 0) { "Transaction id must be positive" }
        return dao.delete(id)
    }

    /** Null when the rate is unavailable right now; [fillMissingAmountEur] retries later. */
    private fun toEur(input: TransactionInput): BigDecimal? =
        exchangeRates.toEur(input.amount, input.currency, input.transactionDate)

    /** Converts rows that have no EUR amount yet (old rows, or saved while rates were unavailable); returns how many were filled. */
    fun fillMissingAmountEur(): Int {
        var filled = 0
        for (transaction in dao.findMissingAmountEur()) {
            val amountEur = exchangeRates.toEur(transaction.amount, transaction.currency, transaction.transactionDate) ?: continue
            if (dao.fillAmountEur(transaction.id, amountEur)) {
                filled++
            }
        }
        return filled
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

        val tagIds = create.tagIds?.distinct()
        if (!tagIds.isNullOrEmpty()) {
            val knownTagIds = dictionaryService.getAllTags().map { it.id }.toSet()
            val unknown = tagIds.filterNot { it in knownTagIds }
            require(unknown.isEmpty()) { "Unknown tag id(s): ${unknown.joinToString()}" }
        }

        return TransactionInput(
            transactionDate = date,
            amount = amount,
            currency = currency,
            personId = personId,
            categoryId = categoryId,
            subcategoryId = subcategoryId,
            comment = comment,
            tagIds = tagIds
        )
    }
}
