package bot

import kotlinx.serialization.Serializable
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

/** Turns a free-form message like "12.50 кофе" into a structured transaction using an LLM. */
interface ExpenseParser {
    fun parse(
        text: String,
        categories: List<Category>,
        subcategories: List<Subcategory>,
        today: LocalDate = LocalDate.now()
    ): ParsedExpense

    companion object {
        /** AI_PROVIDER = "gemini" | "claude"; defaults to gemini when GEMINI_API_KEY is set. */
        fun fromEnv(): ExpenseParser {
            val provider = System.getenv("AI_PROVIDER")?.lowercase()
                ?: if (!System.getenv("GEMINI_API_KEY").isNullOrBlank()) "gemini" else "claude"
            println("Expense parser provider: $provider")
            return when (provider) {
                "gemini" -> GeminiExpenseParser()
                "claude" -> ClaudeExpenseParser()
                else -> throw IllegalArgumentException("Unknown AI_PROVIDER: $provider (expected gemini or claude)")
            }
        }
    }
}

/** Prompt and output schema shared by all providers. */
object ExpensePrompt {
    fun systemPrompt(categories: List<Category>, subcategories: List<Subcategory>, today: LocalDate): String {
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

    val requiredFields = listOf("understood", "amount", "isIncome", "currency", "date", "categoryId", "subcategoryId", "comment")

    /** JSON Schema properties; [nullableInteger] lets each provider express "integer or null" its own way. */
    fun properties(nullableInteger: Map<String, Any>): Map<String, Any> = mapOf(
        "understood" to mapOf("type" to "boolean"),
        "amount" to mapOf("type" to "number"),
        "isIncome" to mapOf("type" to "boolean"),
        "currency" to mapOf("type" to "string"),
        "date" to mapOf("type" to "string", "description" to "YYYY-MM-DD"),
        "categoryId" to mapOf("type" to "integer"),
        "subcategoryId" to nullableInteger,
        "comment" to mapOf("type" to "string")
    )
}
