package bot

import com.anthropic.client.AnthropicClient
import com.anthropic.client.okhttp.AnthropicOkHttpClient
import com.anthropic.core.JsonValue
import com.anthropic.models.messages.JsonOutputFormat
import com.anthropic.models.messages.MessageCreateParams
import com.anthropic.models.messages.OutputConfig
import com.anthropic.models.messages.StopReason
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import model.Category
import model.Subcategory
import java.time.LocalDate

@Serializable
data class ParsedExpense(
    val understood: Boolean,
    val amount: Double,
    val isIncome: Boolean,
    val currency: String,
    val date: String,
    val categoryId: Int,
    val subcategoryId: Int? = null,
    val comment: String
)

/**
 * Turns a free-form message like "12.50 кофе" into a structured transaction
 * using Claude with a JSON schema constrained output.
 */
class ExpenseParser(
    private val model: String = System.getenv("CLAUDE_MODEL") ?: "claude-opus-5-5",
    private val client: AnthropicClient = AnthropicOkHttpClient.fromEnv()
) {
    private val json = Json { ignoreUnknownKeys = true }

    fun parse(
        text: String,
        categories: List<Category>,
        subcategories: List<Subcategory>,
        today: LocalDate = LocalDate.now()
    ): ParsedExpense {
        val params = MessageCreateParams.builder()
            .model(model)
            .maxTokens(4000L)
            .system(buildSystemPrompt(categories, subcategories, today))
            .outputConfig(
                OutputConfig.builder()
                    .effort(OutputConfig.Effort.LOW)
                    .format(JsonOutputFormat.builder().schema(schema).build())
                    .build()
            )
            .addUserMessage(text)
            .build()

        val response = client.messages().create(params)

        val stopReason = response.stopReason().orElse(null)
        if (stopReason == StopReason.REFUSAL) {
            throw IllegalStateException("Модель отказалась обрабатывать запрос")
        }
        if (stopReason == StopReason.MAX_TOKENS) {
            throw IllegalStateException("Ответ модели обрезан (max_tokens)")
        }

        val raw = response.content()
            .flatMap { block -> block.text().map { listOf(it.text()) }.orElse(emptyList()) }
            .joinToString("")

        return json.decodeFromString(ParsedExpense.serializer(), raw)
    }

    private fun buildSystemPrompt(
        categories: List<Category>,
        subcategories: List<Subcategory>,
        today: LocalDate
    ): String {
        val dictionary = categories.joinToString("\n") { category ->
            val subs = subcategories.filter { it.categoryId == category.id }
            val subsText = if (subs.isEmpty()) "" else
                subs.joinToString(prefix = "\n", separator = "\n") { "    - subcategoryId=${it.id}: ${it.name}" }
            "- categoryId=${category.id}: ${category.name}$subsText"
        }

        return """
            You turn short messages from a personal finance Telegram bot into a single transaction record.
            The user writes an amount and what the money was spent on (or received for), usually in Russian,
            e.g. "12.50 кофе", "45 проездной", "зарплата 4200", "вчера 30 аптека".

            Today is $today. Resolve relative dates ("вчера", "позавчера", weekday names) against today;
            if no date is mentioned, use today. Output the date as YYYY-MM-DD.

            Pick the best matching category and, if one fits, a subcategory that belongs to that category.
            Use only ids from this list:
            $dictionary

            Rules:
            - amount is always a positive number; set isIncome=true only for money received (salary, refunds, payments to the user).
            - currency is a 3-letter ISO code; default to EUR unless the message says otherwise (₽/руб → RUB, $ → USD).
            - subcategoryId must belong to the chosen categoryId, or be null if nothing fits well.
            - comment is a short human-readable description of the purchase, in the user's language.
            - If the message has no recognizable amount or is not about money at all, set understood=false
              (fill other fields with any valid placeholder values).
        """.trimIndent()
    }

    private val schema: JsonOutputFormat.Schema = JsonOutputFormat.Schema.builder()
        .putAdditionalProperty("type", JsonValue.from("object"))
        .putAdditionalProperty(
            "properties",
            JsonValue.from(
                mapOf(
                    "understood" to mapOf("type" to "boolean"),
                    "amount" to mapOf("type" to "number"),
                    "isIncome" to mapOf("type" to "boolean"),
                    "currency" to mapOf("type" to "string"),
                    "date" to mapOf("type" to "string", "description" to "YYYY-MM-DD"),
                    "categoryId" to mapOf("type" to "integer"),
                    "subcategoryId" to mapOf("anyOf" to listOf(mapOf("type" to "integer"), mapOf("type" to "null"))),
                    "comment" to mapOf("type" to "string")
                )
            )
        )
        .putAdditionalProperty(
            "required",
            JsonValue.from(
                listOf("understood", "amount", "isIncome", "currency", "date", "categoryId", "subcategoryId", "comment")
            )
        )
        .putAdditionalProperty("additionalProperties", JsonValue.from(false))
        .build()
}
