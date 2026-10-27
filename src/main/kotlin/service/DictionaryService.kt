package service

import dao.DictionaryDao
import model.Category
import model.Person
import model.Subcategory
import model.Tag

class DictionaryService(private val dao: DictionaryDao) {
    fun getAllCategories(): List<Category> = dao.findAllCategories()

    fun getAllSubcategories(): List<Subcategory> = dao.findAllSubcategories()

    fun getAllPersons(): List<Person> = dao.findAllPersons()

    fun getAllTags(): List<Tag> = dao.findAllTags()

    fun createTag(name: String): Tag {
        val normalized = normalizeName(name).lowercase()
        require(normalized.length <= 100) { "Tag name must be at most 100 characters" }
        return dao.insertTag(normalized)
    }

    fun createCategory(name: String): Category {
        val normalized = normalizeName(name)
        return dao.insertCategory(normalized)
    }

    fun createSubcategory(name: String, categoryId: Int): Subcategory {
        if (!categoryExists(categoryId)) {
            throw IllegalArgumentException("Category with id=$categoryId does not exist")
        }

        val normalized = normalizeName(name)
        return dao.insertSubcategory(normalized, categoryId)
    }

    fun categoryExists(id: Int): Boolean = dao.categoryExists(id)

    fun personExists(id: Int): Boolean = dao.personExists(id)

    fun subcategoryExists(categoryId: Int, subcategoryId: Int): Boolean = dao.subcategoryExists(categoryId, subcategoryId)

    private fun normalizeName(name: String): String {
        val normalized = name.trim()
        if (normalized.isBlank()) {
            throw IllegalArgumentException("Name must not be blank")
        }

        return normalized
    }
}

