package bot

import api.TransactionCreateDto
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.contentOrNull
import model.Subcategory
import model.Transaction
import service.DictionaryService
import service.TransactionService
import java.io.File
import java.math.BigDecimal
import java.math.RoundingMode
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.Properties
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Minimal Telegram bot (long polling) that adds transactions from messages like "12.50 кофе".
 *
 * Env:
 *  - TELEGRAM_BOT_TOKEN: token from @BotFather
 *  - allowed users: bot.properties ("telegramUserId=PersonName" per line) and/or
 *    TELEGRAM_USERS as "telegramUserId:PersonName,..." (see [loadAllowedUsers])
 *  - ANTHROPIC_API_KEY: Claude API key
 */
class TelegramBot(
    private val token: String,
    private val allowedUsers: Map<Long, String>,
    private val parser: ExpenseParser,
    private val transactionService: TransactionService,
    private val dictionaryService: DictionaryService
) {
    private val http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build()
    private val json = Json { ignoreUnknownKeys = true }
    private val baseUrl = "https://api.telegram.org/bot$token"
    private val supportedReceiptTypes = setOf("image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf")

    /** Transaction ids per receipt for the "undo receipt" button; kept in memory only. */
    private val receiptTransactions = ConcurrentHashMap<String, List<Int>>()

    fun start() {
        val thread = Thread(::pollLoop, "telegram-bot")
        thread.isDaemon = true
        thread.start()
        println("Telegram bot started (allowed users: ${allowedUsers.keys})")
    }

    private fun pollLoop() {
        var offset = 0L
        while (true) {
            try {
                val result = call(
                    "getUpdates",
                    buildJsonObject {
                        put("offset", offset)
                        put("timeout", 30)
                        putJsonArray("allowed_updates") {
                            add(JsonPrimitive("message"))
                            add(JsonPrimitive("callback_query"))
                        }
                    },
                    requestTimeout = Duration.ofSeconds(40)
                )
                for (update in result.jsonArray) {
                    val obj = update.jsonObject
                    offset = obj["update_id"]!!.jsonPrimitive.long + 1
                    try {
                        handleUpdate(obj)
                    } catch (e: Exception) {
                        System.err.println("Failed to handle update: ${e.message}")
                        e.printStackTrace()
                    }
                }
            } catch (e: Exception) {
                System.err.println("Telegram polling error: ${e.message}")
                Thread.sleep(5_000)
            }
        }
    }

    private fun handleUpdate(update: JsonObject) {
        update["message"]?.jsonObject?.let { handleMessage(it) }
        update["callback_query"]?.jsonObject?.let { handleCallback(it) }
    }

    private fun handleMessage(message: JsonObject) {
        val chatId = message["chat"]!!.jsonObject["id"]!!.jsonPrimitive.long
        val userId = message["from"]?.jsonObject?.get("id")?.jsonPrimitive?.long ?: return

        val personName = allowedUsers[userId]
        if (personName == null) {
            sendMessage(chatId, "Нет доступа. Ваш Telegram id: $userId — добавьте его в bot.properties.")
            return
        }

        if (message["photo"] != null || message["document"] != null) {
            handleReceipt(chatId, message, personName)
            return
        }

        val text = message["text"]?.jsonPrimitive?.content?.trim() ?: return

        when {
            text.startsWith("/start") || text.startsWith("/help") -> {
                sendMessage(chatId, helpText())
                return
            }
            text.startsWith("/categories") -> {
                sendMessage(chatId, categoriesText())
                return
            }
        }

        val categories = dictionaryService.getAllCategories()
        val subcategories = dictionaryService.getAllSubcategories()

        val parsed = try {
            parser.parse(text, categories, subcategories)
        } catch (e: Exception) {
            System.err.println("AI request failed: ${e.message}")
            sendMessage(chatId, "⚠️ Не удалось обработать сообщение: ${e.message}")
            return
        }

        if (!parsed.understood || parsed.amount <= 0.0) {
            sendMessage(chatId, "🤔 Не понял. Напиши сумму и на что потрачено, например: «12.50 кофе».")
            return
        }

        val personId = findPersonId(personName)
        val subcategoryId = validSubcategoryId(parsed.categoryId, parsed.subcategoryId, subcategories)
        val amount = toCents(parsed.amount).let { if (parsed.isIncome) it else it.negate() }

        val created = try {
            transactionService.createTransaction(
                TransactionCreateDto(
                    transactionDate = parsed.date,
                    amount = amount.toPlainString(),
                    currency = parsed.currency,
                    personId = personId,
                    categoryId = parsed.categoryId,
                    subcategoryId = subcategoryId,
                    comment = parsed.comment
                )
            )
        } catch (e: Exception) {
            sendMessage(chatId, "⚠️ Не удалось сохранить: ${e.message}")
            return
        }

        sendMessage(
            chatId,
            "✅ Добавлено\n" + formatTransaction(created),
            replyMarkup = undoButton("↩️ Отменить", "del:${created.id}")
        )
    }

    private fun handleReceipt(chatId: Long, message: JsonObject, personName: String) {
        val caption = message["caption"]?.jsonPrimitive?.contentOrNull?.trim()

        val (fileId, mimeType) = message["photo"]?.jsonArray?.lastOrNull()?.jsonObject?.let { largest ->
            largest["file_id"]!!.jsonPrimitive.content to "image/jpeg"
        } ?: message["document"]!!.jsonObject.let { document ->
            document["file_id"]!!.jsonPrimitive.content to
                (document["mime_type"]?.jsonPrimitive?.contentOrNull ?: "application/octet-stream")
        }

        if (mimeType !in supportedReceiptTypes) {
            sendMessage(chatId, "📄 Пришли чек фотографией или файлом PDF/JPEG/PNG (получен $mimeType).")
            return
        }

        call("sendChatAction", buildJsonObject { put("chat_id", chatId); put("action", "typing") })

        val categories = dictionaryService.getAllCategories()
        val subcategories = dictionaryService.getAllSubcategories()

        val receipt = try {
            val file = Attachment(downloadFile(fileId), mimeType)
            parser.parseReceipt(file, caption, categories, subcategories)
        } catch (e: Exception) {
            System.err.println("Receipt parsing failed: ${e.message}")
            sendMessage(chatId, "⚠️ Не удалось разобрать чек: ${e.message}")
            return
        }

        val items = receipt.items.filter { it.amount > 0.0 }
        if (!receipt.understood || items.isEmpty()) {
            sendMessage(chatId, "🤔 Не получилось прочитать чек. Попробуй сфотографировать ровнее и при хорошем свете.")
            return
        }

        val unknownCategory = items.firstOrNull { item -> categories.none { it.id == item.categoryId } }
        if (unknownCategory != null) {
            sendMessage(chatId, "⚠️ ИИ выбрала несуществующую категорию для «${unknownCategory.description}», попробуй ещё раз.")
            return
        }

        val personId = findPersonId(personName)
        val created = mutableListOf<Transaction>()
        try {
            for (item in items) {
                created += transactionService.createTransaction(
                    TransactionCreateDto(
                        transactionDate = receipt.date,
                        amount = toCents(item.amount).negate().toPlainString(),
                        currency = receipt.currency,
                        personId = personId,
                        categoryId = item.categoryId,
                        subcategoryId = validSubcategoryId(item.categoryId, item.subcategoryId, subcategories),
                        comment = "${receipt.store}: ${item.description}".take(1000)
                    )
                )
            }
        } catch (e: Exception) {
            // Keep a receipt all-or-nothing: roll back the rows inserted so far.
            created.forEach { transactionService.deleteTransaction(it.id) }
            sendMessage(chatId, "⚠️ Не удалось сохранить чек: ${e.message}")
            return
        }

        val key = UUID.randomUUID().toString().take(8)
        receiptTransactions[key] = created.map { it.id }

        val sum = created.sumOf { it.amount.negate() }
        val total = toCents(receipt.total)
        val text = buildString {
            append("🧾 ${receipt.store} · ${receipt.date} · $personName\n")
            append("Добавлено позиций: ${created.size}\n\n")
            created.forEach { t ->
                val category = listOfNotNull(t.category, t.subCategory).joinToString(" / ")
                append("• ${t.comment?.removePrefix("${receipt.store}: ")} — ${t.amount.negate().toPlainString()} · $category\n")
            }
            append("\nИтого: ${sum.toPlainString()} ${receipt.currency}")
            if (sum.compareTo(total) != 0) {
                append("\n⚠️ Сумма по чеку ${total.toPlainString()} ${receipt.currency} — проверь позиции")
            }
        }

        sendMessage(chatId, text.take(4000), replyMarkup = undoButton("↩️ Отменить весь чек", "delr:$key"))
    }

    private fun downloadFile(fileId: String): ByteArray {
        val file = call("getFile", buildJsonObject { put("file_id", fileId) }).jsonObject
        val path = file["file_path"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalStateException("Telegram не отдал файл (больше 20 МБ?)")
        val request = HttpRequest.newBuilder(URI.create("https://api.telegram.org/file/bot$token/$path"))
            .timeout(Duration.ofSeconds(60))
            .GET()
            .build()
        val response = http.send(request, HttpResponse.BodyHandlers.ofByteArray())
        if (response.statusCode() != 200) {
            throw IllegalStateException("Не удалось скачать файл: HTTP ${response.statusCode()}")
        }
        return response.body()
    }

    private fun findPersonId(personName: String): Int? =
        dictionaryService.getAllPersons().firstOrNull { it.name.equals(personName, ignoreCase = true) }?.id

    private fun validSubcategoryId(categoryId: Int, subcategoryId: Int?, subcategories: List<Subcategory>): Int? =
        subcategoryId?.takeIf { id -> subcategories.any { it.id == id && it.categoryId == categoryId } }

    private fun toCents(amount: Double): BigDecimal = BigDecimal.valueOf(amount).setScale(2, RoundingMode.HALF_UP)

    private fun undoButton(text: String, callbackData: String): JsonObject = buildJsonObject {
        put("inline_keyboard", buildJsonArray {
            add(buildJsonArray {
                add(buildJsonObject {
                    put("text", text)
                    put("callback_data", callbackData)
                })
            })
        })
    }

    private fun handleCallback(callback: JsonObject) {
        val callbackId = callback["id"]!!.jsonPrimitive.content
        val userId = callback["from"]!!.jsonObject["id"]!!.jsonPrimitive.long
        val data = callback["data"]?.jsonPrimitive?.content ?: return
        val message = callback["message"]?.jsonObject

        if (userId !in allowedUsers) {
            call("answerCallbackQuery", buildJsonObject { put("callback_query_id", callbackId); put("text", "Нет доступа") })
            return
        }

        val answer = when {
            data.startsWith("del:") -> {
                val id = data.removePrefix("del:").toIntOrNull()
                if (id != null && transactionService.deleteTransaction(id)) "Удалено" else "Уже удалено"
            }
            data.startsWith("delr:") -> {
                val ids = receiptTransactions.remove(data.removePrefix("delr:"))
                if (ids == null) {
                    "Чек не найден (бот перезапускался?) — удали позиции на сайте"
                } else {
                    ids.forEach { transactionService.deleteTransaction(it) }
                    "Удалено позиций: ${ids.size}"
                }
            }
            else -> return
        }

        call("answerCallbackQuery", buildJsonObject {
            put("callback_query_id", callbackId)
            put("text", answer)
        })
        if (message != null && !answer.startsWith("Чек не найден")) {
            val oldText = message["text"]?.jsonPrimitive?.content ?: ""
            call("editMessageText", buildJsonObject {
                put("chat_id", message["chat"]!!.jsonObject["id"]!!.jsonPrimitive.long)
                put("message_id", message["message_id"]!!.jsonPrimitive.int)
                put("text", "🗑 Отменено\n" + oldText.substringAfter('\n'))
            })
        }
    }

    private fun formatTransaction(t: Transaction): String {
        val category = listOfNotNull(t.category, t.subCategory).joinToString(" / ")
        return buildString {
            append("${t.amount.toPlainString()} ${t.currency} · $category\n")
            t.comment?.let { append("$it\n") }
            append(t.transactionDate.toString())
            t.person?.let { append(" · $it") }
        }
    }

    private fun helpText(): String = """
        Пиши сумму и на что потрачено — я сам определю категорию и добавлю запись.

        Примеры:
        • 12.50 кофе
        • 45 проездной
        • вчера 30 аптека
        • зарплата 4200

        Можно прислать фото или PDF чека — я разобью его на позиции и добавлю каждую отдельно.
        В подписи к фото можно уточнить, например «вчера».

        /categories — список категорий
    """.trimIndent()

    private fun categoriesText(): String {
        val subcategories = dictionaryService.getAllSubcategories()
        return dictionaryService.getAllCategories().joinToString("\n") { category ->
            val subs = subcategories.filter { it.categoryId == category.id }.joinToString { it.name }
            if (subs.isEmpty()) "• ${category.name}" else "• ${category.name}: $subs"
        }
    }

    private fun sendMessage(chatId: Long, text: String, replyMarkup: JsonObject? = null) {
        call("sendMessage", buildJsonObject {
            put("chat_id", chatId)
            put("text", text)
            if (replyMarkup != null) put("reply_markup", replyMarkup)
        })
    }

    private fun call(method: String, body: JsonObject, requestTimeout: Duration = Duration.ofSeconds(15)): JsonElement {
        val request = HttpRequest.newBuilder(URI.create("$baseUrl/$method"))
            .timeout(requestTimeout)
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
            .build()
        val response = http.send(request, HttpResponse.BodyHandlers.ofString())
        val parsed = json.parseToJsonElement(response.body()).jsonObject
        if (parsed["ok"]?.jsonPrimitive?.booleanOrNull != true) {
            throw IllegalStateException("Telegram $method failed: ${parsed["description"]}")
        }
        return parsed["result"]!!
    }

    companion object {
        /**
         * Loads allowed users from a properties file ("telegramId=PersonName" per line,
         * path from TELEGRAM_USERS_FILE, default "bot.properties") and the TELEGRAM_USERS env var.
         * Env entries override file entries with the same id.
         */
        fun loadAllowedUsers(): Map<Long, String> {
            val file = File(System.getenv("TELEGRAM_USERS_FILE") ?: "bot.properties")
            val fromFile = if (file.isFile) parseAllowedUsersFile(file) else emptyMap()
            return fromFile + parseAllowedUsers(System.getenv("TELEGRAM_USERS"))
        }

        fun parseAllowedUsersFile(file: File): Map<Long, String> {
            val props = Properties()
            file.reader(Charsets.UTF_8).use { props.load(it) }
            return props.stringPropertyNames()
                .mapNotNull { key ->
                    val id = key.trim().toLongOrNull()
                    val name = props.getProperty(key).trim()
                    if (id == null || name.isEmpty()) {
                        System.err.println("Ignoring invalid entry in ${file.path}: '$key'")
                        null
                    } else {
                        id to name
                    }
                }
                .toMap()
        }

        /** Parses "123:Nikita,456:Natasha" into a map of Telegram user id to person name. */
        fun parseAllowedUsers(raw: String?): Map<Long, String> =
            raw.orEmpty().split(',')
                .mapNotNull { entry ->
                    val (id, name) = entry.split(':', limit = 2).map { it.trim() }.takeIf { it.size == 2 } ?: return@mapNotNull null
                    id.toLongOrNull()?.let { it to name }
                }
                .toMap()
    }
}
