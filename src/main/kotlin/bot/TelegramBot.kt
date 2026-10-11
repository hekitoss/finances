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
        val text = message["text"]?.jsonPrimitive?.content?.trim() ?: return

        val personName = allowedUsers[userId]
        if (personName == null) {
            sendMessage(chatId, "Нет доступа. Ваш Telegram id: $userId — добавьте его в bot.properties.")
            return
        }

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
            System.err.println("Claude request failed: ${e.message}")
            sendMessage(chatId, "⚠️ Не удалось обработать сообщение: ${e.message}")
            return
        }

        if (!parsed.understood || parsed.amount <= 0.0) {
            sendMessage(chatId, "🤔 Не понял. Напиши сумму и на что потрачено, например: «12.50 кофе».")
            return
        }

        val personId = dictionaryService.getAllPersons().firstOrNull { it.name.equals(personName, ignoreCase = true) }?.id
        val subcategoryId = parsed.subcategoryId?.takeIf { id ->
            subcategories.any { it.id == id && it.categoryId == parsed.categoryId }
        }
        val amount = BigDecimal.valueOf(parsed.amount).setScale(2, RoundingMode.HALF_UP)
            .let { if (parsed.isIncome) it else it.negate() }

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
            replyMarkup = buildJsonObject {
                put("inline_keyboard", buildJsonArray {
                    add(buildJsonArray {
                        add(buildJsonObject {
                            put("text", "↩️ Отменить")
                            put("callback_data", "del:${created.id}")
                        })
                    })
                })
            }
        )
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

        if (data.startsWith("del:")) {
            val id = data.removePrefix("del:").toIntOrNull()
            val deleted = id != null && transactionService.deleteTransaction(id)
            call("answerCallbackQuery", buildJsonObject {
                put("callback_query_id", callbackId)
                put("text", if (deleted) "Удалено" else "Уже удалено")
            })
            if (message != null) {
                val oldText = message["text"]?.jsonPrimitive?.content ?: ""
                call("editMessageText", buildJsonObject {
                    put("chat_id", message["chat"]!!.jsonObject["id"]!!.jsonPrimitive.long)
                    put("message_id", message["message_id"]!!.jsonPrimitive.int)
                    put("text", "🗑 Отменено\n" + oldText.substringAfter('\n'))
                })
            }
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
