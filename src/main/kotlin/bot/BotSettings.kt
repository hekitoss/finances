package bot

import java.io.File
import java.util.Properties

/**
 * Per-user bot settings kept in a small properties file (path from BOT_SETTINGS_FILE,
 * default "bot-settings.properties"), so changing them needs no database migration.
 * Currently holds the default currency as "currency.<telegramUserId>=RUB".
 */
class BotSettings(private val file: File = File(System.getenv("BOT_SETTINGS_FILE") ?: "bot-settings.properties")) {
    private val props = Properties()

    init {
        if (file.isFile) file.reader(Charsets.UTF_8).use { props.load(it) }
    }

    @Synchronized
    fun defaultCurrency(userId: Long): String = props.getProperty("currency.$userId") ?: DEFAULT_CURRENCY

    @Synchronized
    fun setDefaultCurrency(userId: Long, currency: String) {
        props.setProperty("currency.$userId", currency)
        file.writer(Charsets.UTF_8).use { props.store(it, "Telegram bot settings") }
    }
}
