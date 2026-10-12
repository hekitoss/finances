package db

import java.io.File
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Monthly database backup: once per calendar month runs `pg_dump` inside the
 * Postgres Docker container and saves a plain SQL dump to `backup/`.
 * Only reads the database; never changes it.
 */
class DatabaseBackup(
    private val backupDir: File = File(System.getenv("BACKUP_DIR") ?: "backup"),
    private val container: String = System.getenv("DB_CONTAINER") ?: "finances_db",
    private val dbUser: String = System.getenv("DB_USER") ?: "finances_user",
    private val dbName: String = System.getenv("DB_NAME") ?: "finances",
    private val keep: Int = System.getenv("BACKUP_KEEP")?.toIntOrNull() ?: 12
) {
    private val fileNamePattern = Regex("""finances-(\d{4}-\d{2}-\d{2})\.sql""")

    fun start() {
        val scheduler = Executors.newSingleThreadScheduledExecutor { r ->
            Thread(r, "db-backup").apply { isDaemon = true }
        }
        // Check right after startup and then every 6 hours, so a month isn't missed
        // even if the computer was off on the 1st.
        scheduler.scheduleWithFixedDelay(::backupIfDue, 1, 6 * 60, TimeUnit.MINUTES)
        println("Database backup scheduled (monthly, folder: ${backupDir.absolutePath})")
    }

    fun backupIfDue() {
        try {
            val today = LocalDate.now()
            val hasBackupThisMonth = existingBackups().any { (date, _) ->
                date.year == today.year && date.month == today.month
            }
            if (!hasBackupThisMonth) {
                backupNow(today)
                deleteOldBackups()
            }
        } catch (e: Exception) {
            System.err.println("Database backup failed: ${e.message}")
        }
    }

    private fun backupNow(date: LocalDate) {
        backupDir.mkdirs()
        val target = File(backupDir, "finances-${date.format(DateTimeFormatter.ISO_LOCAL_DATE)}.sql")
        val tmp = File(backupDir, target.name + ".tmp")
        val errors = File(backupDir, "last-error.log")

        val process = ProcessBuilder(
            "docker", "exec", container,
            "pg_dump", "-U", dbUser, "-d", dbName, "--encoding=UTF8"
        )
            .redirectOutput(tmp)
            .redirectError(errors)
            .start()

        if (!process.waitFor(10, TimeUnit.MINUTES)) {
            process.destroyForcibly()
            tmp.delete()
            throw IllegalStateException("pg_dump timed out")
        }
        if (process.exitValue() != 0 || tmp.length() == 0L) {
            tmp.delete()
            throw IllegalStateException(
                "pg_dump exited with ${process.exitValue()}: ${errors.readText().trim()}"
            )
        }

        if (!tmp.renameTo(target)) {
            target.delete()
            tmp.renameTo(target)
        }
        errors.delete()
        println("Database backup saved: ${target.absolutePath} (${target.length() / 1024} KB)")
    }

    private fun deleteOldBackups() {
        existingBackups()
            .sortedByDescending { it.first }
            .drop(keep)
            .forEach { (_, file) ->
                if (file.delete()) println("Old database backup deleted: ${file.name}")
            }
    }

    private fun existingBackups(): List<Pair<LocalDate, File>> =
        backupDir.listFiles().orEmpty().mapNotNull { file ->
            val match = fileNamePattern.matchEntire(file.name) ?: return@mapNotNull null
            runCatching { LocalDate.parse(match.groupValues[1]) to file }.getOrNull()
        }
}
