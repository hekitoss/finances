package bot

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import model.Category
import model.Subcategory
import model.Tag
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.time.LocalDate
import java.util.Base64

/**
 * Gemini API (Interactions endpoint) with JSON schema constrained output.
 * Env: GEMINI_API_KEY, GEMINI_MODEL (default gemini-3.5-flash-lite).
 */
class GeminiExpenseParser(
    private val apiKey: String = System.getenv("GEMINI_API_KEY")
        ?: throw IllegalStateException("GEMINI_API_KEY is not set"),
    private val model: String = System.getenv("GEMINI_MODEL") ?: "gemini-3.5-flash-lite"
) : ExpenseParser {
    private val http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build()
    private val json = Json { ignoreUnknownKeys = true }
    private val nullableInteger = mapOf("type" to listOf("integer", "null"))

    private val expenseSchema = toJson(ExpensePrompt.expenseSchema(nullableInteger))
    private val receiptSchema = toJson(ExpensePrompt.receiptSchema(nullableInteger))

    override fun parse(
        text: String,
        categories: List<Category>,
        subcategories: List<Subcategory>,
        tags: List<Tag>,
        defaultCurrency: String,
        today: LocalDate
    ): ParsedExpense {
        val raw = interact(
            systemInstruction = ExpensePrompt.systemPrompt(categories, subcategories, tags, defaultCurrency, today),
            input = JsonPrimitive(text),
            schema = expenseSchema,
            thinkingLevel = "minimal"
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
        val input = buildJsonArray {
            add(buildJsonObject {
                put("type", if (file.mimeType == "application/pdf") "document" else "image")
                put("data", Base64.getEncoder().encodeToString(file.bytes))
                put("mime_type", file.mimeType)
            })
            add(buildJsonObject {
                put("type", "text")
                put("text", caption?.takeIf { it.isNotBlank() } ?: "Разбери этот чек.")
            })
        }

        val raw = interact(
            systemInstruction = ExpensePrompt.receiptSystemPrompt(categories, subcategories, tags, defaultCurrency, today),
            input = input,
            schema = receiptSchema,
            thinkingLevel = "low"
        )
        return json.decodeFromString(ParsedReceipt.serializer(), raw)
    }

    private fun interact(systemInstruction: String, input: JsonElement, schema: JsonElement, thinkingLevel: String): String {
        val body = buildJsonObject {
            put("model", model)
            put("system_instruction", systemInstruction)
            put("input", input)
            // Don't keep the interaction on Google's side; we never continue it.
            put("store", false)
            put("response_format", buildJsonObject {
                put("type", "text")
                put("mime_type", "application/json")
                put("schema", schema)
            })
            put("generation_config", buildJsonObject {
                put("thinking_level", thinkingLevel)
            })
        }

        val request = HttpRequest.newBuilder(URI.create("https://generativelanguage.googleapis.com/v1beta/interactions"))
            .timeout(Duration.ofSeconds(120))
            .header("Content-Type", "application/json")
            .header("x-goog-api-key", apiKey)
            .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
            .build()

        val response = http.send(request, HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() == 429) {
            throw IllegalStateException("Превышен лимит бесплатных запросов Gemini, попробуй позже")
        }
        if (response.statusCode() !in 200..299) {
            throw IllegalStateException("Gemini HTTP ${response.statusCode()}: ${response.body().take(500)}")
        }

        val interaction = json.parseToJsonElement(response.body()).jsonObject
        val status = interaction["status"]?.jsonPrimitive?.contentOrNull
        if (status != "completed") {
            throw IllegalStateException("Gemini status=$status: ${interaction["errors"] ?: ""}")
        }

        val raw = interaction["steps"]?.jsonArray.orEmpty()
            .map { it.jsonObject }
            .filter { it["type"]?.jsonPrimitive?.contentOrNull == "model_output" }
            .flatMap { it["content"]?.jsonArray.orEmpty() }
            .map { it.jsonObject }
            .filter { it["type"]?.jsonPrimitive?.contentOrNull == "text" }
            .joinToString("") { it["text"]?.jsonPrimitive?.contentOrNull.orEmpty() }

        if (raw.isBlank()) {
            throw IllegalStateException("Gemini вернул пустой ответ")
        }
        return raw
    }

    private fun toJson(value: Any?): JsonElement = when (value) {
        null -> JsonNull
        is String -> JsonPrimitive(value)
        is Number -> JsonPrimitive(value)
        is Boolean -> JsonPrimitive(value)
        is Map<*, *> -> JsonObject(value.entries.associate { (k, v) -> k.toString() to toJson(v) })
        is List<*> -> JsonArray(value.map { toJson(it) })
        else -> throw IllegalArgumentException("Unsupported schema value: $value")
    }
}
