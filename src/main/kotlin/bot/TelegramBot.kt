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
import model.Tag
import model.Transaction
import model.TransactionItem
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
    private val dictionaryService: DictionaryService,
    private val receiptStorage: ReceiptStorage = ReceiptStorage(),
    private val settings: BotSettings = BotSettings()
) {
    private val http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build()
    private val json = Json { ignoreUnknownKeys = true }
    private val baseUrl = "https://api.telegram.org/bot$token"
    /** Currencies offered as buttons in /currency; any other 3-letter code can be typed as "/currency GBP". */
    private val currencyChoices = listOf("EUR", "RUB", "USD", "JPY")
    private val supportedReceiptTypes = setOf("image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf")
    /** Error messages whose retry button was already pressed, so a double tap doesn't process the message twice. */
    private val usedRetries = java.util.Collections.newSetFromMap(object : LinkedHashMap<String, Boolean>() {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Boolean>) = size > 1000
    })

    fun start() {
        registerCommands()
        val thread = Thread(::pollLoop, "telegram-bot")
        thread.isDaemon = true
        thread.start()
        println("Telegram bot started (allowed users: ${allowedUsers.keys})")
    }

    /**
     * Fills Telegram's "Menu" button with the bot's commands. Having /settings there also makes Telegram show a
     * "Settings" item in the bot's profile menu. A failure only loses the menu, so it is logged and ignored.
     */
    private fun registerCommands() {
        val commands = listOf(
            "settings" to "Настройки: валюта по умолчанию",
            "categories" to "Список категорий",
            "tags" to "Список тэгов",
            "help" to "Как пользоваться ботом"
        )
        try {
            call("setMyCommands", buildJsonObject {
                put("commands", buildJsonArray {
                    commands.forEach { (command, description) ->
                        add(buildJsonObject { put("command", command); put("description", description) })
                    }
                })
            })
        } catch (e: Exception) {
            System.err.println("Failed to register bot commands: ${e.message}")
        }
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
        val messageId = message["message_id"]!!.jsonPrimitive.int
        val userId = message["from"]?.jsonObject?.get("id")?.jsonPrimitive?.long ?: return

        val personName = allowedUsers[userId]
        if (personName == null) {
            sendMessage(chatId, "Нет доступа. Ваш Telegram id: $userId — добавьте его в bot.properties.")
            return
        }

        if (message["photo"] != null || message["document"] != null) {
            handleReceipt(chatId, messageId, message, personName, userId)
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
            text.startsWith("/tags") -> {
                sendMessage(chatId, tagsText())
                return
            }
            text.startsWith("/currency") || text.startsWith("/settings") -> {
                handleCurrencyCommand(chatId, userId, text.substringAfter(' ', "").trim())
                return
            }
        }

        val categories = dictionaryService.getAllCategories()
        val subcategories = dictionaryService.getAllSubcategories()
        val tags = dictionaryService.getAllTags()

        val parsed = try {
            parser.parse(text, categories, subcategories, tags, settings.defaultCurrency(userId))
        } catch (e: Exception) {
            System.err.println("AI request failed: ${e.message}")
            sendError(chatId, messageId, "⚠️ Не удалось обработать сообщение: ${e.message}")
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
                    comment = parsed.comment,
                    tagIds = validTagIds(parsed.tagIds, tags)
                )
            )
        } catch (e: Exception) {
            sendError(chatId, messageId, "⚠️ Не удалось сохранить: ${e.message}")
            return
        }

        sendMessage(
            chatId,
            "✅ Добавлено\n" + formatTransaction(created),
            replyMarkup = inlineButton("↩️ Отменить", "del:${created.id}")
        )
    }

    private fun handleReceipt(chatId: Long, messageId: Int, message: JsonObject, personName: String, userId: Long) {
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
        val tags = dictionaryService.getAllTags()

        val bytes = try {
            downloadFile(fileId)
        } catch (e: Exception) {
            System.err.println("Receipt download failed: ${e.message}")
            sendError(chatId, messageId, "⚠️ Не удалось скачать чек: ${e.message}")
            return
        }

        val receipt = try {
            parser.parseReceipt(Attachment(bytes, mimeType), caption, categories, subcategories, tags, settings.defaultCurrency(userId))
        } catch (e: Exception) {
            System.err.println("Receipt parsing failed: ${e.message}")
            saveReceiptFile { receiptStorage.saveUnmatched(bytes, mimeType) }
            sendError(chatId, messageId, "⚠️ Не удалось разобрать чек: ${e.message}")
            return
        }

        val items = receipt.items.filter { it.amount > 0.0 }
        if (!receipt.understood || items.isEmpty()) {
            saveReceiptFile { receiptStorage.saveUnmatched(bytes, mimeType) }
            sendMessage(chatId, "🤔 Не получилось прочитать чек. Попробуй сфотографировать ровнее и при хорошем свете.")
            return
        }

        if (categories.none { it.id == receipt.categoryId }) {
            saveReceiptFile { receiptStorage.saveUnmatched(bytes, mimeType) }
            sendMessage(chatId, "⚠️ ИИ выбрала несуществующую категорию для чека, попробуй ещё раз.")
            return
        }

        // Item categories are informational; drop ones that don't exist instead of failing the whole receipt.
        val transactionItems = items.map { item ->
            val categoryId = item.categoryId.takeIf { id -> categories.any { it.id == id } }
            TransactionItem(
                name = item.description,
                amount = toCents(item.amount).negate(),
                categoryId = categoryId,
                subcategoryId = categoryId?.let { validSubcategoryId(it, item.subcategoryId, subcategories) }
            )
        }

        val itemsSum = transactionItems.sumOf { it.amount.negate() }
        // The receipt row stores what was actually paid; fall back to the items sum if the total wasn't read.
        val total = toCents(receipt.total).takeIf { it.signum() > 0 } ?: itemsSum

        val created = try {
            transactionService.createTransactionWithItems(
                TransactionCreateDto(
                    transactionDate = receipt.date,
                    amount = total.negate().toPlainString(),
                    currency = receipt.currency,
                    personId = findPersonId(personName),
                    categoryId = receipt.categoryId,
                    subcategoryId = validSubcategoryId(receipt.categoryId, receipt.subcategoryId, subcategories),
                    comment = receipt.store.take(1000),
                    tagIds = validTagIds(receipt.tagIds, tags)
                ),
                transactionItems
            )
        } catch (e: Exception) {
            saveReceiptFile { receiptStorage.saveUnmatched(bytes, mimeType) }
            sendError(chatId, messageId, "⚠️ Не удалось сохранить чек: ${e.message}")
            return
        }

        saveReceiptFile { receiptStorage.saveForTransaction(created.id, created.transactionDate, receipt.store, bytes, mimeType) }

        val text = buildString {
            append("🧾 Чек добавлен\n")
            append(formatTransaction(created))
            append("\n\nПозиции (${transactionItems.size}):\n")
            transactionItems.forEach { item ->
                append("• ${item.name} — ${item.amount.negate().toPlainString()}\n")
            }
            if (itemsSum.compareTo(total) != 0) {
                append("\n⚠️ Сумма позиций ${itemsSum.toPlainString()} не совпадает с итогом чека ${total.toPlainString()} — проверь")
            }
        }

        sendMessage(chatId, text.take(4000), replyMarkup = inlineButton("↩️ Отменить чек", "del:${created.id}"))
    }

    /** A failure to keep the file must not break the receipt flow, so it is only logged. */
    private fun saveReceiptFile(save: () -> File) {
        try {
            println("Receipt saved to ${save().path}")
        } catch (e: Exception) {
            System.err.println("Failed to save receipt file: ${e.message}")
        }
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

    /** "/currency" shows the current default with buttons to change it; "/currency GBP" sets any ISO code directly. */
    private fun handleCurrencyCommand(chatId: Long, userId: Long, argument: String) {
        if (argument.isEmpty()) {
            val current = settings.defaultCurrency(userId)
            sendMessage(
                chatId,
                "💱 Валюта по умолчанию: $current\nОна ставится, если в сообщении или чеке валюта не указана. " +
                    "Выбери другую или напиши, например, «/currency GBP».",
                replyMarkup = inlineButtons(currencyChoices.map { (if (it == current) "✓ $it" else it) to "cur:$it" })
            )
            return
        }
        val currency = argument.uppercase()
        if (!currency.matches(Regex("[A-Z]{3}"))) {
            sendMessage(chatId, "Нужен трёхбуквенный код валюты, например «/currency RUB».")
            return
        }
        settings.setDefaultCurrency(userId, currency)
        sendMessage(chatId, "💱 Теперь по умолчанию $currency")
    }

    private fun findPersonId(personName: String): Int? =
        dictionaryService.getAllPersons().firstOrNull { it.name.equals(personName, ignoreCase = true) }?.id

    private fun validSubcategoryId(categoryId: Int, subcategoryId: Int?, subcategories: List<Subcategory>): Int? =
        subcategoryId?.takeIf { id -> subcategories.any { it.id == id && it.categoryId == categoryId } }

    /** Drops tag ids the model made up; tags are optional, so this never fails the message. */
    private fun validTagIds(tagIds: List<Int>, tags: List<Tag>): List<Int> =
        tagIds.distinct().filter { id -> tags.any { it.id == id } }

    private fun toCents(amount: Double): BigDecimal = BigDecimal.valueOf(amount).setScale(2, RoundingMode.HALF_UP)

    private fun inlineButton(text: String, callbackData: String): JsonObject = buildJsonObject {
        put("inline_keyboard", buildJsonArray {
            add(buildJsonArray {
                add(buildJsonObject {
                    put("text", text)
                    put("callback_data", callbackData)
                })
            })
        })
    }

    /** One row of buttons, each given as text to callback data. */
    private fun inlineButtons(buttons: List<Pair<String, String>>): JsonObject = buildJsonObject {
        put("inline_keyboard", buildJsonArray {
            add(buildJsonArray {
                buttons.forEach { (text, callbackData) ->
                    add(buildJsonObject {
                        put("text", text)
                        put("callback_data", callbackData)
                    })
                }
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

        if (data == "retry") {
            handleRetry(callbackId, message)
            return
        }

        if (data.startsWith("cur:")) {
            val currency = data.removePrefix("cur:")
            settings.setDefaultCurrency(userId, currency)
            answerCallback(callbackId, "По умолчанию $currency")
            if (message != null) {
                call("editMessageText", buildJsonObject {
                    put("chat_id", message["chat"]!!.jsonObject["id"]!!.jsonPrimitive.long)
                    put("message_id", message["message_id"]!!.jsonPrimitive.int)
                    put("text", "💱 Теперь по умолчанию $currency")
                })
            }
            return
        }

        if (data.startsWith("del:")) {
            // Receipt items are removed together with the transaction (ON DELETE CASCADE).
            val id = data.removePrefix("del:").toIntOrNull()
            val deleted = id != null && transactionService.deleteTransaction(id)
            if (deleted) receiptStorage.deleteForTransaction(id!!)
            call("answerCallbackQuery", buildJsonObject {
                put("callback_query_id", callbackId)
                put("text", if (deleted) "Удалено" else "Уже удалено")
            })
        } else {
            return
        }

        if (message != null) {
            val oldText = message["text"]?.jsonPrimitive?.content ?: ""
            call("editMessageText", buildJsonObject {
                put("chat_id", message["chat"]!!.jsonObject["id"]!!.jsonPrimitive.long)
                put("message_id", message["message_id"]!!.jsonPrimitive.int)
                put("text", "🗑 Отменено\n" + oldText.substringAfter('\n'))
            })
        }
    }

    /**
     * Re-processes the message the error replied to. Telegram includes that original message (text, photo or
     * document with its file_id) in reply_to_message, so nothing has to be kept in memory and it survives restarts.
     * The error message is deleted first; if the retry fails again, a new error with its own button is sent.
     */
    private fun handleRetry(callbackId: String, message: JsonObject?) {
        val original = message?.get("reply_to_message")?.jsonObject
        val chatId = message?.get("chat")?.jsonObject?.get("id")?.jsonPrimitive?.long
        val errorMessageId = message?.get("message_id")?.jsonPrimitive?.int
        if (original == null || chatId == null || errorMessageId == null) {
            answerCallback(callbackId, "Исходное сообщение не найдено, пришли его ещё раз")
            return
        }
        if (!usedRetries.add("$chatId:$errorMessageId")) {
            answerCallback(callbackId, "Уже повторяю")
            return
        }
        answerCallback(callbackId, "Повторяю…")
        try {
            call("deleteMessage", buildJsonObject { put("chat_id", chatId); put("message_id", errorMessageId) })
        } catch (e: Exception) {
            // Messages older than 48h can't be deleted; just drop the button instead.
            try {
                call("editMessageReplyMarkup", buildJsonObject { put("chat_id", chatId); put("message_id", errorMessageId) })
            } catch (_: Exception) {
            }
        }
        handleMessage(original)
    }

    private fun answerCallback(callbackId: String, text: String) {
        call("answerCallbackQuery", buildJsonObject { put("callback_query_id", callbackId); put("text", text) })
    }

    /** Sends an error as a reply to the failed message, with a button that processes that message again. */
    private fun sendError(chatId: Long, replyToMessageId: Int, text: String) {
        sendMessage(chatId, text, replyMarkup = inlineButton("🔄 Повторить", "retry"), replyToMessageId = replyToMessageId)
    }

    private fun formatTransaction(t: Transaction): String {
        val category = listOfNotNull(t.category, t.subCategory).joinToString(" / ")
        return buildString {
            append("${t.amount.toPlainString()} ${t.currency}")
            if (t.currency != "EUR") {
                append(t.amountEur?.let { " (≈ ${it.toPlainString()} EUR)" } ?: " (курс EUR пока не получен)")
            }
            append(" · $category\n")
            t.comment?.let { append("$it\n") }
            if (t.tags.isNotEmpty()) append(t.tags.joinToString(" ", postfix = "\n") { "#$it" })
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

        Можно прислать фото или PDF чека — я добавлю его одной тратой и сохраню все позиции.
        В подписи к фото можно уточнить, например «вчера».

        Тэги (например «подарок») я подбираю сам, можно и подсказать: «30 цветы маме, подарок».

        /categories — список категорий
        /tags — список тэгов
        /settings или /currency — валюта по умолчанию (в самом сообщении можно указать любую: «500 руб такси»)
    """.trimIndent()

    private fun categoriesText(): String {
        val subcategories = dictionaryService.getAllSubcategories()
        return dictionaryService.getAllCategories().joinToString("\n") { category ->
            val subs = subcategories.filter { it.categoryId == category.id }.joinToString { it.name }
            if (subs.isEmpty()) "• ${category.name}" else "• ${category.name}: $subs"
        }
    }

    private fun tagsText(): String {
        val tags = dictionaryService.getAllTags()
        return if (tags.isEmpty()) "Тэгов пока нет — их можно добавить на сайте в форме записи."
        else tags.joinToString("\n") { "• ${it.name}" }
    }

    private fun sendMessage(chatId: Long, text: String, replyMarkup: JsonObject? = null, replyToMessageId: Int? = null) {
        call("sendMessage", buildJsonObject {
            put("chat_id", chatId)
            put("text", text.take(4000))
            if (replyMarkup != null) put("reply_markup", replyMarkup)
            if (replyToMessageId != null) put("reply_parameters", buildJsonObject {
                put("message_id", replyToMessageId)
                put("allow_sending_without_reply", true)
            })
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
