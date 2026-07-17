import controller.DictionariesController
import controller.TransactionsController
import dao.DictionaryDao
import dao.TransactionDao
import db.Database
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

fun main() {
    embeddedServer(Netty, port = 8080) {
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

