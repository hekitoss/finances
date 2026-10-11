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

@Serializable
data class ReceiptItem(
    val description: String,
    val amount: Double,
    val categoryId: Int,
    val subcategoryId: Int? = null
)

@Serializable
data class ParsedReceipt(
    val understood: Boolean,
    val store: String,
    val date: String,
    val currency: String,
    val total: Double,
    val items: List<ReceiptItem>
)

/** A file sent to the bot (receipt photo or PDF). */
class Attachment(val bytes: ByteArray, val mimeType: String)

/** Turns free-form messages and receipts into structured transactions using an LLM. */
interface ExpenseParser {
    /** Parses a message like "12.50 кофе" into a single transaction. */
    fun parse(
        text: String,
        categories: List<Category>,
        subcategories: List<Subcategory>,
        today: LocalDate = LocalDate.now()
    ): ParsedExpense

    /** Splits a receipt (photo or PDF) into line items, each with its own category. */
    fun parseReceipt(
        file: Attachment,
        caption: String?,
        categories: List<Category>,
        subcategories: List<Subcategory>,
        today: LocalDate = LocalDate.now()
    ): ParsedReceipt

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

/** Prompts and output schemas shared by all providers. */
object ExpensePrompt {
    private fun dictionary(categories: List<Category>, subcategories: List<Subcategory>): String =
        categories.joinToString("\n") { category ->
            val subs = subcategories.filter { it.categoryId == category.id }
            val subsText = if (subs.isEmpty()) "" else
                subs.joinToString(prefix = "\n", separator = "\n") { "    - subcategoryId=${it.id}: ${it.name}" }
            "- categoryId=${category.id}: ${category.name}$subsText"
        }

    fun systemPrompt(categories: List<Category>, subcategories: List<Subcategory>, today: LocalDate): String =
        """
            You turn short messages from a personal finance Telegram bot into a single transaction record.
            The user writes an amount and what the money was spent on (or received for), usually in Russian,
            e.g. "12.50 кофе", "45 проездной", "зарплата 4200", "вчера 30 аптека".

            Today is $today. Resolve relative dates ("вчера", "позавчера", weekday names) against today;
            if no date is mentioned, use today. Output the date as YYYY-MM-DD.

            Pick the best matching category and, if one fits, a subcategory that belongs to that category.
            Use only ids from this list:
            ${dictionary(categories, subcategories)}

            Rules:
            - amount is always a positive number; set isIncome=true only for money received (salary, refunds, payments to the user).
            - currency is a 3-letter ISO code; default to EUR unless the message says otherwise (₽/руб → RUB, $ → USD).
            - subcategoryId must belong to the chosen categoryId, or be null if nothing fits well.
            - comment is a short human-readable description of the purchase, in the user's language.
            - If the message has no recognizable amount or is not about money at all, set understood=false
              (fill other fields with any valid placeholder values).
        """.trimIndent()

    fun receiptSystemPrompt(categories: List<Category>, subcategories: List<Subcategory>, today: LocalDate): String =
        """
            You read a shop receipt (photo or PDF) for a personal finance app and split it into purchased line items.
            The user may add a caption with hints (e.g. "это для работы", "вчера") — take it into account.

            Today is $today. Use the purchase date printed on the receipt as YYYY-MM-DD; if there is none, use today
            (or the date from the caption).

            For every item pick the best matching category and, if one fits, a subcategory that belongs to that category.
            Use only ids from this list:
            ${dictionary(categories, subcategories)}

            Rules:
            - One entry per purchased product line. Skip non-product lines: subtotals, tax/VAT breakdowns,
              payment method, change, card terminal data, loyalty points.
            - amount is the positive line total actually paid for that product (quantity × unit price),
              after discounts that belong to that line. Bottle deposits (Pfand) go into the amount of the product they belong to;
              deposit returns (Leergut) reduce the amount of the item they are printed next to.
            - A discount that applies to the whole receipt is spread proportionally over the items.
            - The sum of all item amounts must equal total, the final amount paid shown on the receipt.
            - description is a short readable product name in Russian, keeping the brand if useful
              (e.g. "Молоко 3.5% (Weihenstephan)").
            - store is the shop name. currency is a 3-letter ISO code (EUR if not shown).
            - subcategoryId must belong to the chosen categoryId, or be null if nothing fits well.
            - If the file is not a receipt or is unreadable, set understood=false and return an empty items list.
        """.trimIndent()

    /** JSON Schema for [ParsedExpense]; [nullableInteger] lets each provider express "integer or null" its own way. */
    fun expenseSchema(nullableInteger: Map<String, Any>): Map<String, Any> = objectSchema(
        mapOf(
            "understood" to mapOf("type" to "boolean"),
            "amount" to mapOf("type" to "number"),
            "isIncome" to mapOf("type" to "boolean"),
            "currency" to mapOf("type" to "string"),
            "date" to mapOf("type" to "string", "description" to "YYYY-MM-DD"),
            "categoryId" to mapOf("type" to "integer"),
            "subcategoryId" to nullableInteger,
            "comment" to mapOf("type" to "string")
        )
    )

    /** JSON Schema for [ParsedReceipt]. */
    fun receiptSchema(nullableInteger: Map<String, Any>): Map<String, Any> = objectSchema(
        mapOf(
            "understood" to mapOf("type" to "boolean"),
            "store" to mapOf("type" to "string"),
            "date" to mapOf("type" to "string", "description" to "YYYY-MM-DD"),
            "currency" to mapOf("type" to "string"),
            "total" to mapOf("type" to "number"),
            "items" to mapOf(
                "type" to "array",
                "items" to objectSchema(
                    mapOf(
                        "description" to mapOf("type" to "string"),
                        "amount" to mapOf("type" to "number"),
                        "categoryId" to mapOf("type" to "integer"),
                        "subcategoryId" to nullableInteger
                    )
                )
            )
        )
    )

    private fun objectSchema(properties: Map<String, Any>): Map<String, Any> = mapOf(
        "type" to "object",
        "properties" to properties,
        "required" to properties.keys.toList(),
        "additionalProperties" to false
    )
}
