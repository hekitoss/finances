import bot.ExpenseParser
import bot.TelegramBot
import controller.DictionariesController
import controller.TransactionsController
import dao.DictionaryDao
import dao.TransactionDao
import db.Database
import db.DatabaseBackup
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.http.content.staticFiles
import io.ktor.server.response.respondFile
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.cors.routing.CORS
import io.ktor.server.plugins.callloging.CallLogging
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import kotlinx.serialization.json.Json
import service.DictionaryService
import service.TransactionService
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

fun main() {
    embeddedServer(Netty, port = System.getenv("PORT")?.toIntOrNull() ?: 8080) {
        module()
    }.start(wait = true)
}

fun Application.module() {
    install(ContentNegotiation) {
        json(Json { prettyPrint = true; isLenient = true })
    }

    install(CORS) {
        allowHost("localhost:5173", schemes = listOf("http"))
        allowHost("127.0.0.1:5173", schemes = listOf("http"))
        allowMethod(HttpMethod.Get)
        allowMethod(HttpMethod.Post)
        allowMethod(HttpMethod.Put)
        allowMethod(HttpMethod.Delete)
        allowMethod(HttpMethod.Options)
        allowHeader(HttpHeaders.ContentType)
        allowHeader(HttpHeaders.Accept)
    }

    install(CallLogging)

    val dataSource = Database.dataSource()
    val transactionDao = TransactionDao(dataSource)
    val dictionaryDao = DictionaryDao(dataSource)
    val dictionaryService = DictionaryService(dictionaryDao)
    val transactionService = TransactionService(transactionDao, dictionaryService)
    val transactionsController = TransactionsController(transactionService)
    val dictionariesController = DictionariesController(dictionaryService)
    val telegramToken = System.getenv("TELEGRAM_BOT_TOKEN")
    if (!telegramToken.isNullOrBlank()) {
        TelegramBot(
            token = telegramToken,
            allowedUsers = TelegramBot.loadAllowedUsers(),
            parser = ExpenseParser.fromEnv(),
            transactionService = transactionService,
            dictionaryService = dictionaryService
        ).start()
    }

    startAmountEurFiller(transactionService)

    if (System.getenv("BACKUP_DISABLED") != "true") {
        DatabaseBackup().start()
    }

    val frontendDir = File("frontend/dist")
    val frontendIndex = File(frontendDir, "index.html")

    routing {
        transactionsController.registerRoutes(this)
        dictionariesController.registerRoutes(this)

        staticFiles("/", frontendDir) {
            default("index.html")
        }

        get("/add") {
            call.respondFile(frontendIndex)
        }

        get("/transactions/{id}/edit") {
            call.respondFile(frontendIndex)
        }
    }
}

/** Fills missing EUR amounts right after startup and then hourly, so rows saved while rates were unavailable catch up. */
private fun startAmountEurFiller(transactionService: TransactionService) {
    val scheduler = Executors.newSingleThreadScheduledExecutor { r ->
        Thread(r, "amount-eur-filler").apply { isDaemon = true }
    }
    scheduler.scheduleWithFixedDelay({
        try {
            val filled = transactionService.fillMissingAmountEur()
            if (filled > 0) {
                println("Filled EUR amounts for $filled transaction(s)")
            }
        } catch (e: Exception) {
            System.err.println("Filling EUR amounts failed: ${e.message}")
        }
    }, 0, 60, TimeUnit.MINUTES)
}

