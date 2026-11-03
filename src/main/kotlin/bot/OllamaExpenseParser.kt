package bot

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import model.Category
import model.Subcategory
import model.Tag
import java.net.ConnectException
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.time.LocalDate
import java.util.Base64

/**
 * Local model through Ollama (/api/chat) with JSON schema constrained output.
 *
 * Env:
 * - OLLAMA_URL (default http://localhost:11434)
 * - OLLAMA_MODEL (default qwen3:14b) — text messages
 * - OLLAMA_VISION_MODEL (optional, e.g. qwen2.5vl:7b) — receipt photos; qwen3 itself can't see images
 * - OLLAMA_NUM_CTX (default 8192) — context window; Ollama's own default is too small for the prompt
 * - OLLAMA_THINK (default false) — let qwen3 reason before answering (slower, sometimes more accurate)
 * - OLLAMA_KEEP_ALIVE (optional, e.g. 30m or -1) — how long Ollama keeps the model in memory after a request;
 *   loading qwen3:14b from scratch takes minutes, so a longer value makes the bot answer fast more often
 *
 * Receipts the local models can't handle (PDFs, or photos without OLLAMA_VISION_MODEL) go to
 * [receiptFallback] — the cloud provider, if its key is set.
 */
class OllamaExpenseParser(
    baseUrl: String = System.getenv("OLLAMA_URL")?.takeIf { it.isNotBlank() } ?: "http://localhost:11434",
    private val model: String = System.getenv("OLLAMA_MODEL")?.takeIf { it.isNotBlank() } ?: "qwen3:14b",
    private val visionModel: String? = System.getenv("OLLAMA_VISION_MODEL")?.takeIf { it.isNotBlank() },
    private val numCtx: Int = System.getenv("OLLAMA_NUM_CTX")?.toIntOrNull() ?: 8192,
    private val think: Boolean = System.getenv("OLLAMA_THINK")?.lowercase() == "true",
    private val keepAlive: String? = System.getenv("OLLAMA_KEEP_ALIVE")?.takeIf { it.isNotBlank() },
    private val receiptFallback: ExpenseParser? = null
) : ExpenseParser {
    private val chatUrl = URI.create(baseUrl.trimEnd('/') + "/api/chat")
    private val http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build()
    private val json = Json { ignoreUnknownKeys = true }
    private val nullableInteger = mapOf("type" to listOf("integer", "null"))

    override fun parse(
        text: String,
        categories: List<Category>,
        subcategories: List<Subcategory>,
        tags: List<Tag>,
        defaultCurrency: String,
        today: LocalDate
    ): ParsedExpense {
        val raw = chat(
            model = model,
            system = ExpensePrompt.systemPrompt(categories, subcategories, tags, defaultCurrency, today),
            user = text,
            images = emptyList(),
            schema = restrictIds(ExpensePrompt.expenseSchema(nullableInteger), categories, subcategories, tags)
        )
        return json.decodeFromString(ParsedExpense.serializer(), raw)
    }

    override fun parseReceipt(
        file: Attachment,
        caption: String?,
        categories: List<Category>,
        subcategories: List<Subcategory>,
        tags: List<Tag>,
        defaultCurrency: String,
        today: LocalDate
    ): ParsedReceipt {
        val isImage = file.mimeType == "image/jpeg" || file.mimeType == "image/png"
        if (!isImage || visionModel == null) {
            if (receiptFallback != null) {
                return receiptFallback.parseReceipt(file, caption, categories, subcategories, tags, defaultCurrency, today)
            }
            throw IllegalStateException(
                if (!isImage) "локальная модель не умеет читать ${file.mimeType}, пришли чек фотографией"
                else "локальная модель $model не видит картинки: задай OLLAMA_VISION_MODEL (например qwen2.5vl:7b) или ключ облачного ИИ"
            )
        }

        val raw = chat(
            model = visionModel,
            system = ExpensePrompt.receiptSystemPrompt(categories, subcategories, tags, defaultCurrency, today),
            user = caption?.takeIf { it.isNotBlank() } ?: "Разбери этот чек.",
            images = listOf(Base64.getEncoder().encodeToString(file.bytes)),
            schema = restrictIds(ExpensePrompt.receiptSchema(nullableInteger), categories, subcategories, tags)
        )
        return json.decodeFromString(ParsedReceipt.serializer(), raw)
    }

    private fun chat(model: String, system: String, user: String, images: List<String>, schema: JsonElement): String {
        val body = buildJsonObject {
            put("model", model)
            put("stream", false)
            put("think", think)
            if (keepAlive != null) put("keep_alive", keepAlive.toIntOrNull()?.let { JsonPrimitive(it) } ?: JsonPrimitive(keepAlive))
            put("format", schema)
            put("messages", buildJsonArray {
                add(buildJsonObject {
                    put("role", "system")
                    put("content", system)
                })
                add(buildJsonObject {
                    put("role", "user")
                    put("content", user)
                    if (images.isNotEmpty()) put("images", buildJsonArray { images.forEach { add(it) } })
                })
            })
            put("options", buildJsonObject {
                put("temperature", 0)
                put("num_ctx", numCtx)
            })
        }

        val request = HttpRequest.newBuilder(chatUrl)
            // The first request after a pause also loads the model into memory, which can take a while.
            .timeout(Duration.ofSeconds(300))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
            .build()

        val response = try {
            http.send(request, HttpResponse.BodyHandlers.ofString())
        } catch (e: ConnectException) {
            throw IllegalStateException("Ollama недоступна по адресу $chatUrl — она запущена?")
        }
        if (response.statusCode() !in 200..299) {
            throw IllegalStateException("Ollama HTTP ${response.statusCode()}: ${response.body().take(500)}")
        }

        val raw = json.parseToJsonElement(response.body()).jsonObject["message"]
            ?.jsonObject?.get("content")?.jsonPrimitive?.contentOrNull.orEmpty()
        if (raw.isBlank()) {
            throw IllegalStateException("Ollama вернула пустой ответ")
        }
        return raw
    }

    /**
     * Adds enums with the real ids to the schema, so the grammar-constrained decoder can't invent a category.
     * Small local models need this much more than the cloud ones.
     */
    private fun restrictIds(schema: Map<String, Any>, categories: List<Category>, subcategories: List<Subcategory>, tags: List<Tag>): JsonElement {
        fun walk(value: Any?, key: String?): JsonElement = when {
            value is Map<*, *> -> {
                val obj = value.entries.associate { (k, v) -> k.toString() to walk(v, k.toString()) }.toMutableMap()
                when (key) {
                    "categoryId" -> if (categories.isNotEmpty()) obj["enum"] = JsonArray(categories.map { JsonPrimitive(it.id) })
                    "subcategoryId" -> obj["enum"] = JsonArray(subcategories.map { JsonPrimitive(it.id) } + JsonNull)
                    "tagIds" -> if (tags.isNotEmpty()) {
                        obj["items"] = JsonObject(mapOf("type" to JsonPrimitive("integer"), "enum" to JsonArray(tags.map { JsonPrimitive(it.id) })))
                    }
                }
                JsonObject(obj)
            }
            value is List<*> -> JsonArray(value.map { walk(it, null) })
            value == null -> JsonNull
            value is String -> JsonPrimitive(value)
            value is Number -> JsonPrimitive(value)
            value is Boolean -> JsonPrimitive(value)
            else -> throw IllegalArgumentException("Unsupported schema value: $value")
        }
        return walk(schema, null)
    }
}
