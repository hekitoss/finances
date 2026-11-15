package bot

import kotlin.test.Test
import kotlin.test.assertEquals

class CommentHintsTest {
    @Test
    fun replacesInventedDetails() {
        assertEquals("мак", CommentHints.resolve("мак 8.50", "кофе в мак"))
        assertEquals("мак", CommentHints.resolve("8,50€ мак", "Обед в McDonald's"))
    }

    @Test
    fun keepsCommentMadeOfUsersWords() {
        assertEquals("аптека", CommentHints.resolve("вчера 30 аптеку", "аптека"))
        assertEquals("кофе", CommentHints.resolve("12.50 кофе", "кофе"))
    }

    @Test
    fun stripsAmountCurrencyAndDate() {
        assertEquals("продукты", CommentHints.ownWords("вчера 500р продукты"))
        assertEquals("такси", CommentHints.ownWords("такси 20 евро"))
    }

    @Test
    fun keepsAiCommentWhenMessageHasNoWords() {
        assertEquals("покупка", CommentHints.resolve("30", "покупка"))
    }
}
