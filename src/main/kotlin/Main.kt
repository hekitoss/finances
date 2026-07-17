import dao.DictionaryDao
import dao.TransactionDao
import db.Database
import service.DictionaryService
import service.TransactionService

fun main() {
    println("Finances Kotlin project initialized. Hello, Никита!")

    val ds = Database.dataSource()
    val transactionDao = TransactionDao(ds)
    val dictionaryDao = DictionaryDao(ds)
    val dictionaryService = DictionaryService(dictionaryDao)
    val transactionService = TransactionService(transactionDao, dictionaryService)

    println("Fetching transactions from DB (DB_URL=${System.getenv("DB_URL") ?: "jdbc:postgresql://localhost:5432/finances"})...")
    try {
        val rows = transactionService.getAllTransactions()
        if (rows.isEmpty()) {
            println("No transactions found.")
            return
        }

        rows.forEach { transaction ->
            println(
                "[${transaction.transactionDate}] ${transaction.amount} ${transaction.currency} — " +
                    "${transaction.category} / ${transaction.subCategory} (${transaction.person}) ${transaction.comment ?: ""}"
            )
        }
    } catch (e: Exception) {
        System.err.println("Failed to fetch transactions: ${e.message}")
        e.printStackTrace()
    }
}

