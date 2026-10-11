package bot

import com.anthropic.client.AnthropicClient
import com.anthropic.client.okhttp.AnthropicOkHttpClient
import com.anthropic.core.JsonValue
import com.anthropic.models.messages.JsonOutputFormat
import com.anthropic.models.messages.MessageCreateParams
import com.anthropic.models.messages.OutputConfig
import com.anthropic.models.messages.StopReason
import kotlinx.serialization.json.Json
import model.Category
import model.Subcategory
import java.time.LocalDate

/** Claude API with a JSON schema constrained output. Env: ANTHROPIC_API_KEY, CLAUDE_MODEL. */
class ClaudeExpenseParser(
    private val model: String = System.getenv("CLAUDE_MODEL") ?: "claude-opus-5-5",
    private val client: AnthropicClient = AnthropicOkHttpClient.fromEnv()
) : ExpenseParser {
    private val json = Json { ignoreUnknownKeys = true }

    private val schema: JsonOutputFormat.Schema = JsonOutputFormat.Schema.builder()
        .putAdditionalProperty("type", JsonValue.from("object"))
        .putAdditionalProperty(
            "properties",
            JsonValue.from(
                ExpensePrompt.properties(
                    nullableInteger = mapOf("anyOf" to listOf(mapOf("type" to "integer"), mapOf("type" to "null")))
                )
            )
        )
        .putAdditionalProperty("required", JsonValue.from(ExpensePrompt.requiredFields))
        .putAdditionalProperty("additionalProperties", JsonValue.from(false))
        .build()

    override fun parse(
        text: String,
        categories: List<Category>,
        subcategories: List<Subcategory>,
        today: LocalDate
    ): ParsedExpense {
        val params = MessageCreateParams.builder()
            .model(model)
            .maxTokens(4000L)
            .system(ExpensePrompt.systemPrompt(categories, subcategories, today))
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
}
