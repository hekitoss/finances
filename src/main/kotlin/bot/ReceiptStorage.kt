package bot

import java.io.File
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/**
 * Keeps the original receipt files sent to the bot in a local folder
 * (RECEIPTS_DIR, default "receipts", gitignored).
 *
 * Files are named "<transaction date>_<transaction id>.<ext>", or
 * "<today>_unmatched_<time>.<ext>" when no transaction was created from the receipt.
 */
class ReceiptStorage(private val dir: File = File(System.getenv("RECEIPTS_DIR") ?: "receipts")) {

    fun saveForTransaction(transactionId: Int, date: LocalDate, bytes: ByteArray, mimeType: String): File =
        write("${date}_$transactionId", bytes, mimeType)

    fun saveUnmatched(bytes: ByteArray, mimeType: String): File {
        val now = LocalDateTime.now()
        return write("${now.toLocalDate()}_unmatched_${now.format(DateTimeFormatter.ofPattern("HHmmss"))}", bytes, mimeType)
    }

    /** Removes the receipt files of a deleted transaction. */
    fun deleteForTransaction(transactionId: Int) {
        dir.listFiles { file -> file.nameWithoutExtension.endsWith("_$transactionId") && !file.name.contains("_unmatched_") }
            ?.forEach { it.delete() }
    }

    private fun write(baseName: String, bytes: ByteArray, mimeType: String): File {
        dir.mkdirs()
        val file = File(dir, "$baseName.${extension(mimeType)}")
        file.writeBytes(bytes)
        return file
    }

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
