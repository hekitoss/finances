package bot

/**
 * Keeps the transaction comment in the user's own words.
 *
 * Models (especially small local ones) like to "improve" the comment: "мак 8" came back as "кофе в мак".
 * The comment from the AI is kept only if every meaningful word in it also appears in the message
 * (allowing for Russian word endings: "аптека" for "аптеку" is fine). Otherwise the comment is the
 * message itself with the amount, currency and date words removed.
 */
object CommentHints {
    private val word = Regex("[\\p{L}]+")

    /** Short service words the AI may add without changing the meaning ("в", "на", "за", "и"). */
    private const val MIN_WORD = 3

    /** Words that only carry the date or currency and don't belong in the comment. */
    private val dropWords = Regex(
        "(?<!\\p{L})(" +
            "сегодня|вчера|позавчера|" +
            "понедельник|вторник|сред[ау]|четверг|пятниц[ау]|суббот[ау]|воскресенье|" +
            "в\\s+(пн|вт|ср|чт|пт|сб|вс)|" +
            "евро|руб(л[а-я]*)?|доллар[а-я]*|бакс[а-я]*|[ий]ен[а-я]*|" +
            "eur|euros?|rub|usd|dollars?|bucks?|yen|jpy" +
            ")(?!\\p{L})",
        RegexOption.IGNORE_CASE
    )

    /** Numbers (with decimals), currency symbols and the "500р" / "1к" shorthand. */
    private val amounts = Regex("\\d+(?:[.,]\\d+)?\\s*(?:[кk](?!\\p{L}))?\\s*(?:р\\.?(?!\\p{L}))?|[€₽$¥£]")

    fun resolve(text: String, aiComment: String?): String {
        val ai = aiComment?.trim().orEmpty()
        val own = ownWords(text)
        if (ai.isNotEmpty() && onlyUsersWords(ai, text)) return ai
        return own.ifEmpty { ai }
    }

    /** The message without amount, currency and date words, e.g. "мак 8.50€" → "мак". */
    fun ownWords(text: String): String =
        text.replace(dropWords, " ")
            .replace(amounts, " ")
            .replace(Regex("\\s+"), " ")
            .trim(' ', ',', '.', '-', '—', ':', ';')
            .trim()

    private fun onlyUsersWords(comment: String, text: String): Boolean {
        val textWords = words(text)
        return words(comment).filter { it.length >= MIN_WORD }.all { w -> textWords.any { t -> sameWord(w, t) } }
    }

    private fun words(s: String): List<String> =
        word.findAll(s.lowercase().replace('ё', 'е')).map { it.value }.toList()

    /** Same word up to its ending: a common prefix of at least 4 letters, or the whole shorter word. */
    private fun sameWord(a: String, b: String): Boolean {
        val common = a.zip(b).takeWhile { (x, y) -> x == y }.size
        return common >= minOf(4, a.length, b.length)
    }
}
