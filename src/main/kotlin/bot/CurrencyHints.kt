package bot

import java.util.Currency

/**
 * Decides whether a bot message names a currency itself.
 *
 * The AI parser is asked to use the user's default currency when the message doesn't name one, but models
 * (especially small local ones) often guess instead — e.g. RUB because the message is in Russian.
 * So the bot only trusts the currency from the AI when the text really mentions one, and otherwise
 * always uses the default from /currency.
 */
object CurrencyHints {
    private val isoCodes: Set<String> = Currency.getAvailableCurrencies().map { it.currencyCode }.toSet()

    private val symbols = Regex("[€₽$¥£₸₴₺₹₩฿₪₫₦₱]")

    /** Russian word stems, matched at the start of a word ("500 руб", "20 баксов", "3000 йен"). */
    private val russianWords = Regex(
        "(?<!\\p{L})(евро|руб|доллар|бакс|иен|йен|юан|фунт|франк|тенге|гривн|злот|крон|дирхам|динар|шекел|форинт|рупи|песо|манат)"
    )

    /** English words and lowercase ISO codes, matched as whole words ("20 usd", "5 bucks"). */
    private val latinWords = Regex(
        "(?<![a-z])(" +
            "eur|euros?|rub|usd|dollars?|bucks?|yen|jpy|yuan|cny|pounds?|gbp|francs?|chf|kzt|uah|zloty|pln|" +
            "czk|sek|nok|dkk|aed|baht|thb|krw|gel|amd|uzs|ils|huf|ron|rupees?|inr|pesos?|brl|kgs|azn" +
            ")(?![a-z])"
    )

    /** Russian shorthand right after a number: "500р", "500 р.", "1к р". */
    private val rubleShorthand = Regex("\\d\\s*[кk]?\\s*р(?![\\p{L}])")

    fun mentionsCurrency(text: String): Boolean {
        val lower = text.lowercase()
        if (symbols.containsMatchIn(text) || russianWords.containsMatchIn(lower) || latinWords.containsMatchIn(lower) || rubleShorthand.containsMatchIn(lower)) return true
        // Any other ISO code written in capitals as a separate word ("20 SGD").
        return Regex("(?<![A-Za-z])[A-Z]{3}(?![A-Za-z])").findAll(text).any { it.value in isoCodes }
    }

    /**
     * Currency to store for a message: the AI's answer when the message names a currency and the answer is a
     * valid ISO code, otherwise [defaultCurrency].
     */
    fun resolve(text: String?, aiCurrency: String?, defaultCurrency: String): String {
        val ai = aiCurrency?.trim()?.uppercase()?.takeIf { it in isoCodes }
        return if (ai != null && text != null && mentionsCurrency(text)) ai else defaultCurrency
    }
}
