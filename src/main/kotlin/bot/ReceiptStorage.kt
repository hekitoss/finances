package bot

import java.io.File
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/**
 * Keeps the original receipt files sent to the bot in a local folder
 * (RECEIPTS_DIR, default "receipts", gitignored).
 *
 * Files are named "<transaction date>_<transaction id>_<store>.<ext>" (store left out if unknown), or
 * "<today>_unmatched_<time>.<ext>" when no transaction was created from the receipt.
 */
class ReceiptStorage(private val dir: File = File(System.getenv("RECEIPTS_DIR") ?: "receipts")) {

    fun saveForTransaction(transactionId: Int, date: LocalDate, store: String?, bytes: ByteArray, mimeType: String): File {
        val storePart = store?.let(::safeFileNamePart)?.takeIf { it.isNotEmpty() }?.let { "_$it" } ?: ""
        return write("${date}_$transactionId$storePart", bytes, mimeType)
    }

    fun saveUnmatched(bytes: ByteArray, mimeType: String): File {
        val now = LocalDateTime.now()
        return write("${now.toLocalDate()}_unmatched_${now.format(DateTimeFormatter.ofPattern("HHmmss"))}", bytes, mimeType)
    }

    /** Removes the receipt files of a deleted transaction. */
    fun deleteForTransaction(transactionId: Int) {
        val pattern = Regex("""\d{4}-\d{2}-\d{2}_${transactionId}(_.*)?\.[^.]+""")
        dir.listFiles { file -> pattern.matches(file.name) }?.forEach { it.delete() }
    }

    private fun write(baseName: String, bytes: ByteArray, mimeType: String): File {
        dir.mkdirs()
        val file = File(dir, "$baseName.${extension(mimeType)}")
        file.writeBytes(bytes)
        return file
    }

    /** Drops characters Windows doesn't allow in file names and keeps the name short. */
    private fun safeFileNamePart(raw: String): String =
        raw.replace(Regex("[<>:\"/\\\\|?*\\p{Cntrl}]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
            .take(60)
            .trimEnd(' ', '.')

    private fun extension(mimeType: String): String = when (mimeType) {
        "image/jpeg" -> "jpg"
        "image/png" -> "png"
        "image/webp" -> "webp"
        "image/heic" -> "heic"
        "image/heif" -> "heif"
        "application/pdf" -> "pdf"
        else -> "bin"
    }
}
