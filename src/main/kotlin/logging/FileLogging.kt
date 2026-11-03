package logging

import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.io.PrintStream
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/**
 * Copies everything written to System.out and System.err (println, stack traces, slf4j-simple) into one file
 * per day: logs/2026-11-03.log. The console output stays as it was. Each line in the file gets a timestamp and
 * ERR for stderr; a "=== Server start ===" line separates runs. The folder comes from LOG_DIR, default "logs".
 */
object FileLogging {
    private val timeFormat = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS")
    private val lock = Any()
    private lateinit var dir: File
    private var currentDate: LocalDate? = null
    private var file: FileOutputStream? = null

    fun install() {
        dir = File(System.getenv("LOG_DIR") ?: "logs")
        dir.mkdirs()
        System.setOut(PrintStream(LineTee(System.out, ""), true, Charsets.UTF_8))
        System.setErr(PrintStream(LineTee(System.err, "ERR "), true, Charsets.UTF_8))
        println("=== Server start (pid ${ProcessHandle.current().pid()}) ===")
    }

    private fun writeLine(prefix: String, line: String) = synchronized(lock) {
        try {
            val now = LocalDateTime.now()
            if (now.toLocalDate() != currentDate) {
                file?.close()
                currentDate = now.toLocalDate()
                file = FileOutputStream(File(dir, "$currentDate.log"), true)
            }
            file!!.write("${now.format(timeFormat)} $prefix$line\n".toByteArray(Charsets.UTF_8))
            file!!.flush()
        } catch (_: Exception) {
            // Logging must never break the app; the console still has the line.
        }
    }

    /** Passes bytes to the console unchanged and hands each complete line to the daily file. */
    private class LineTee(private val console: OutputStream, private val prefix: String) : OutputStream() {
        private val buffer = java.io.ByteArrayOutputStream()

        @Synchronized
        override fun write(b: Int) {
            console.write(b)
            if (b == '\n'.code) flushLine() else buffer.write(b)
        }

        @Synchronized
        override fun write(b: ByteArray, off: Int, len: Int) {
            console.write(b, off, len)
            for (i in off until off + len) {
                if (b[i] == '\n'.code.toByte()) flushLine() else buffer.write(b[i].toInt())
            }
        }

        override fun flush() = console.flush()

        private fun flushLine() {
            val line = buffer.toString(Charsets.UTF_8).trimEnd('\r')
            buffer.reset()
            writeLine(prefix, line)
        }
    }
}
