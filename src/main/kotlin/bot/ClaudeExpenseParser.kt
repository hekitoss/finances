package bot

import com.anthropic.client.AnthropicClient
import com.anthropic.client.okhttp.AnthropicOkHttpClient
import com.anthropic.core.JsonValue
import com.anthropic.models.messages.Base64ImageSource
import com.anthropic.models.messages.Base64PdfSource
import com.anthropic.models.messages.ContentBlockParam
import com.anthropic.models.messages.DocumentBlockParam
import com.anthropic.models.messages.ImageBlockParam
import com.anthropic.models.messages.JsonOutputFormat
import com.anthropic.models.messages.MessageCreateParams
import com.anthropic.models.messages.OutputConfig
import com.anthropic.models.messages.StopReason
import com.anthropic.models.messages.TextBlockParam
import kotlinx.serialization.json.Json
import model.Category
import model.Subcategory
import java.time.LocalDate
import java.util.Base64

/** Claude API with JSON schema constrained output. Env: ANTHROPIC_API_KEY, CLAUDE_MODEL. */
class ClaudeExpenseParser(
    private val model: String = System.getenv("CLAUDE_MODEL") ?: "claude-opus-5-5",
    private val client: AnthropicClient = AnthropicOkHttpClient.fromEnv()
) : ExpenseParser {
    private val json = Json { ignoreUnknownKeys = true }
    private val nullableInteger = mapOf("anyOf" to listOf(mapOf("type" to "integer"), mapOf("type" to "null")))

    private val expenseSchema = toSchema(ExpensePrompt.expenseSchema(nullableInteger))
    private val receiptSchema = toSchema(ExpensePrompt.receiptSchema(nullableInteger))

    override fun parse(
        text: String,
        categories: List<Category>,
        subcategories: List<Subcategory>,
        today: LocalDate
    ): ParsedExpense {
        val raw = request(
            system = ExpensePrompt.systemPrompt(categories, subcategories, today),
            content = listOf(textBlock(text)),
            schema = expenseSchema,
            effort = OutputConfig.Effort.LOW
        )
        return json.decodeFromString(ParsedExpense.serializer(), raw)
    }

    override fun parseReceipt(
        file: Attachment,
        caption: String?,
        categories: List<Category>,
        subcategories: List<Subcategory>,
        today: LocalDate
    ): ParsedReceipt {
        val data = Base64.getEncoder().encodeToString(file.bytes)
        val fileBlock = if (file.mimeType == "application/pdf") {
            ContentBlockParam.ofDocument(
                DocumentBlockParam.builder().source(Base64PdfSource.builder().data(data).build()).build()
            )
        } else {
            val mediaType = when (file.mimeType) {
                "image/jpeg" -> Base64ImageSource.MediaType.IMAGE_JPEG
                "image/png" -> Base64ImageSource.MediaType.IMAGE_PNG
                "image/webp" -> Base64ImageSource.MediaType.IMAGE_WEBP
                "image/gif" -> Base64ImageSource.MediaType.IMAGE_GIF
                else -> throw IllegalArgumentException("Формат ${file.mimeType} не поддерживается, пришли JPEG, PNG или PDF")
            }
            ContentBlockParam.ofImage(
                ImageBlockParam.builder()
                    .source(Base64ImageSource.builder().data(data).mediaType(mediaType).build())
                    .build()
            )
        }

        val raw = request(
            system = ExpensePrompt.receiptSystemPrompt(categories, subcategories, today),
            content = listOf(fileBlock, textBlock(caption?.takeIf { it.isNotBlank() } ?: "Разбери этот чек.")),
            schema = receiptSchema,
            effort = OutputConfig.Effort.MEDIUM
        )
        return json.decodeFromString(ParsedReceipt.serializer(), raw)
    }

    private fun request(
        system: String,
        content: List<ContentBlockParam>,
        schema: JsonOutputFormat.Schema,
        effort: OutputConfig.Effort
    ): String {
        val params = MessageCreateParams.builder()
            .model(model)
            .maxTokens(16000L)
            .system(system)
            .outputConfig(
                OutputConfig.builder()
                    .effort(effort)
                    .format(JsonOutputFormat.builder().schema(schema).build())
                    .build()
            )
            .addUserMessageOfBlockParams(content)
            .build()

        val response = client.messages().create(params)

        val stopReason = response.stopReason().orElse(null)
        if (stopReason == StopReason.REFUSAL) {
            throw IllegalStateException("Модель отказалась обрабатывать запрос")
        }
        if (stopReason == StopReason.MAX_TOKENS) {
            throw IllegalStateException("Ответ модели обрезан (max_tokens)")
        }

        return response.content()
            .flatMap { block -> block.text().map { listOf(it.text()) }.orElse(emptyList()) }
            .joinToString("")
    }

    private fun textBlock(text: String): ContentBlockParam =
        ContentBlockParam.ofText(TextBlockParam.builder().text(text).build())

    private fun toSchema(schema: Map<String, Any>): JsonOutputFormat.Schema =
        JsonOutputFormat.Schema.builder()
            .apply { schema.forEach { (key, value) -> putAdditionalProperty(key, JsonValue.from(value)) } }
            .build()
}
