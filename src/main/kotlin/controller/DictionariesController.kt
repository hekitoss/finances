package controller

import api.CategoryDto
import api.CategoryCreateDto
import api.DictionariesDto
import api.PersonDto
import api.SubcategoryDto
import api.SubcategoryCreateDto
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import service.DictionaryService

class DictionariesController(private val service: DictionaryService) {
    fun registerRoutes(route: Route) {
        route.get("/api/dictionaries") {
            val response = DictionariesDto(
                categories = service.getAllCategories().map { CategoryDto(id = it.id, name = it.name) },
                subcategories = service.getAllSubcategories().map {
                    SubcategoryDto(id = it.id, name = it.name, categoryId = it.categoryId)
                },
                persons = service.getAllPersons().map { PersonDto(id = it.id, name = it.name) }
            )

            call.respond(response)
        }

        route.post("/api/categories") {
            val create = call.receive<CategoryCreateDto>()

            try {
                val created = service.createCategory(create.name)
                call.respond(HttpStatusCode.Created, CategoryDto(id = created.id, name = created.name))
            } catch (e: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Invalid category payload")))
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, mapOf("error" to (e.message ?: "unknown")))
            }
        }

        route.post("/api/subcategories") {
            val create = call.receive<SubcategoryCreateDto>()

            try {
                val created = service.createSubcategory(create.name, create.categoryId)
                call.respond(
                    HttpStatusCode.Created,
                    SubcategoryDto(id = created.id, name = created.name, categoryId = created.categoryId)
                )
            } catch (e: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Invalid subcategory payload")))
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, mapOf("error" to (e.message ?: "unknown")))
            }
        }
    }
}


