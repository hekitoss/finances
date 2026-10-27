package controller

import api.TransactionCreateDto
import api.TransactionDto
import api.TransactionFormDto
import api.TransactionItemDto
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import service.TransactionService
import java.time.LocalDate
import java.time.format.DateTimeParseException

class TransactionsController(private val service: TransactionService) {
    private fun toDto(transaction: model.Transaction): TransactionDto = TransactionDto(
        id = transaction.id,
        transactionDate = transaction.transactionDate.toString(),
        amount = transaction.amount.toPlainString(),
        currency = transaction.currency,
        person = transaction.person,
        category = transaction.category,
        subCategory = transaction.subCategory,
        comment = transaction.comment,
        itemsCount = transaction.itemsCount,
        tags = transaction.tags
    )

    private fun toFormDto(transaction: model.Transaction): TransactionFormDto = TransactionFormDto(
        id = transaction.id,
        transactionDate = transaction.transactionDate.toString(),
        amount = transaction.amount.toPlainString(),
        currency = transaction.currency,
        personId = transaction.personId,
        categoryId = transaction.categoryId,
        subcategoryId = transaction.subcategoryId,
        comment = transaction.comment,
        tagIds = transaction.tagIds
    )

    // Parses the inclusive ?from=YYYY-MM-DD&to=YYYY-MM-DD range; null when either is missing or malformed.
    private fun parseDateRange(from: String?, to: String?): Pair<LocalDate, LocalDate>? {
        if (from == null || to == null) {
            return null
        }
        return try {
            LocalDate.parse(from) to LocalDate.parse(to)
        } catch (e: DateTimeParseException) {
            null
        }
    }

    fun registerRoutes(route: Route) {
        route.get("/api/transactions") {
            val monthParam = call.request.queryParameters["month"]
            val yearParam = call.request.queryParameters["year"]
            val fromParam = call.request.queryParameters["from"]
            val toParam = call.request.queryParameters["to"]

            try {
                val rows = when {
                    fromParam != null || toParam != null -> {
                        val range = parseDateRange(fromParam, toParam)
                        if (range == null) {
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Both from and to are required as YYYY-MM-DD dates"))
                            return@get
                        }
                        service.getTransactionsByDateRange(from = range.first, to = range.second)
                    }
                    monthParam == null && yearParam == null -> service.getAllTransactions()
                    monthParam != null && yearParam != null -> {
                        val month = monthParam.toIntOrNull()
                        val year = yearParam.toIntOrNull()
                        if (month == null || year == null) {
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Month and year must be numbers"))
                            return@get
                        }
                        service.getTransactionsByMonthYear(month = month, year = year)
                    }
                    else -> {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Both month and year are required"))
                        return@get
                    }
                }

                val dto = rows.map(::toDto)
                call.respond(dto)
            } catch (e: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Invalid month/year")))
            }
        }

        route.get("/api/transactions/export") {
            val fromParam = call.request.queryParameters["from"]
            val toParam = call.request.queryParameters["to"]
            val range = parseDateRange(fromParam, toParam)
            val monthParam = call.request.queryParameters["month"]
            val yearParam = call.request.queryParameters["year"]
            val month = monthParam?.toIntOrNull()
            val year = yearParam?.toIntOrNull()
            // No period params at all means "all time".
            val exportAll = fromParam == null && toParam == null && monthParam == null && yearParam == null

            if (range == null && (fromParam != null || toParam != null)) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Both from and to are required as YYYY-MM-DD dates"))
                return@get
            }

            if (range == null && !exportAll && (month == null || year == null)) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Month and year are required and must be numbers"))
                return@get
            }

            try {
                val bytes: ByteArray
                val fileName: String
                if (range != null) {
                    bytes = service.exportTransactionsByDateRangeToExcel(from = range.first, to = range.second)
                    fileName = "transactions-${range.first}_${range.second}.xlsx"
                } else if (exportAll) {
                    bytes = service.exportAllTransactionsToExcel()
                    fileName = "transactions-all.xlsx"
                } else {
                    bytes = service.exportTransactionsByMonthYearToExcel(month = month!!, year = year!!)
                    fileName = "transactions-%04d-%02d.xlsx".format(year, month)
                }
                call.response.header(HttpHeaders.ContentDisposition, "attachment; filename=\"$fileName\"")
                call.respondBytes(
                    bytes = bytes,
                    contentType = ContentType.parse("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                )
            } catch (e: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Invalid month/year")))
            }
        }

        route.get("/api/transactions/{id}") {
            val id = call.parameters["id"]?.toIntOrNull()
            if (id == null) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid transaction id"))
                return@get
            }

            val transaction = service.getTransaction(id)
            if (transaction == null) {
                call.respond(HttpStatusCode.NotFound, mapOf("error" to "Transaction not found"))
                return@get
            }

            call.respond(toFormDto(transaction))
        }

        route.get("/api/transactions/{id}/items") {
            val id = call.parameters["id"]?.toIntOrNull()
            if (id == null || id <= 0) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid transaction id"))
                return@get
            }

            val items = service.getTransactionItems(id).map { item ->
                TransactionItemDto(
                    id = item.id,
                    position = item.position,
                    name = item.name,
                    amount = item.amount.toPlainString(),
                    category = item.category,
                    subCategory = item.subCategory
                )
            }
            call.respond(items)
        }

        route.post("/api/transactions") {
            val create = call.receive<TransactionCreateDto>()

            try {
                val created = service.createTransaction(create)
                call.respond(HttpStatusCode.Created, toDto(created))
            } catch (e: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Invalid transaction payload")))
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, mapOf("error" to (e.message ?: "unknown")))
            }
        }

        route.put("/api/transactions/{id}") {
            val id = call.parameters["id"]?.toIntOrNull()
            if (id == null) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid transaction id"))
                return@put
            }

            val update = call.receive<TransactionCreateDto>()

            try {
                val updated = service.updateTransaction(id, update)
                if (updated == null) {
                    call.respond(HttpStatusCode.NotFound, mapOf("error" to "Transaction not found"))
                    return@put
                }

                call.respond(toDto(updated))
            } catch (e: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Invalid transaction payload")))
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, mapOf("error" to (e.message ?: "unknown")))
            }
        }

        route.delete("/api/transactions/{id}") {
            val id = call.parameters["id"]?.toIntOrNull()
            if (id == null) {
                call.respond(HttpStatusCode.BadRequest)
                return@delete
            }
            val result = service.deleteTransaction(id)
            call.respond(HttpStatusCode.OK, result)
        }
    }
}

