package bot

import java.time.LocalDate

/**
 * Fixes the purchase date the AI read from a receipt.
 *
 * Receipts often print a two-digit year ("21.11.26"), and the model sometimes gets the year wrong:
 * a Bauhaus receipt from 2026-11-21 came back as 2025-11-21 and dropped out of the current month.
 * A receipt is almost always sent within days of the purchase, so when the date is in the future or
 * older than [RECENT_DAYS], the same day and month in this or last year is used if that lands in the
 * recent window. Dates that still don't fit (a genuinely old receipt) are kept as they are.
 */
object ReceiptDates {
    private const val RECENT_DAYS = 60L

    fun resolve(raw: String, today: LocalDate = LocalDate.now()): String {
        val date = runCatching { LocalDate.parse(raw.trim()) }.getOrNull() ?: return raw
        if (isRecent(date, today)) return raw
        val fixed = listOf(today.year, today.year - 1)
            .map { date.withYear(it) }
            .firstOrNull { isRecent(it, today) }
        return fixed?.toString() ?: raw
    }

    private fun isRecent(date: LocalDate, today: LocalDate): Boolean =
        !date.isAfter(today) && !date.isBefore(today.minusDays(RECENT_DAYS))
}
