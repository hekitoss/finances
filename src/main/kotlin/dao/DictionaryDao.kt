package dao

import model.Category
import model.Person
import model.Subcategory
import java.sql.SQLException
import javax.sql.DataSource

class DictionaryDao(private val ds: DataSource) {

    fun findAllCategories(): List<Category> {
        val sql = "SELECT id, name FROM categories ORDER BY name"

        ds.connection.use { conn ->
            conn.prepareStatement(sql).use { stmt ->
                stmt.executeQuery().use { rs ->
                    val rows = mutableListOf<Category>()
                    while (rs.next()) {
                        rows += Category(
                            id = rs.getInt("id"),
                            name = rs.getString("name")
                        )
                    }
                    return rows
                }
            }
        }
    }

    fun findAllSubcategories(): List<Subcategory> {
        val sql = "SELECT id, name, category_id FROM subcategories ORDER BY category_id, name"

        ds.connection.use { conn ->
            conn.prepareStatement(sql).use { stmt ->
                stmt.executeQuery().use { rs ->
                    val rows = mutableListOf<Subcategory>()
                    while (rs.next()) {
                        rows += Subcategory(
                            id = rs.getInt("id"),
                            name = rs.getString("name"),
                            categoryId = rs.getInt("category_id")
                        )
                    }
                    return rows
                }
            }
        }
    }

    fun findAllPersons(): List<Person> {
        val sql = "SELECT id, name FROM persons ORDER BY name"

        ds.connection.use { conn ->
            conn.prepareStatement(sql).use { stmt ->
                stmt.executeQuery().use { rs ->
                    val rows = mutableListOf<Person>()
                    while (rs.next()) {
                        rows += Person(
                            id = rs.getInt("id"),
                            name = rs.getString("name")
                        )
                    }
                    return rows
                }
            }
        }
    }

    fun insertCategory(name: String): Category {
        val sql = "INSERT INTO categories (name) VALUES (?) RETURNING id, name"

        ds.connection.use { conn ->
            conn.prepareStatement(sql).use { stmt ->
                stmt.setString(1, name)
                try {
                    stmt.executeQuery().use { rs ->
                        if (rs.next()) {
                            return Category(
                                id = rs.getInt("id"),
                                name = rs.getString("name")
                            )
                        }
                    }
                } catch (e: SQLException) {
                    throw mapInsertException(e, "Category '$name' already exists")
                }
            }
        }

        throw IllegalStateException("Failed to insert category")
    }

    fun insertSubcategory(name: String, categoryId: Int): Subcategory {
        val sql = "INSERT INTO subcategories (name, category_id) VALUES (?, ?) RETURNING id, name, category_id"

        ds.connection.use { conn ->
            conn.prepareStatement(sql).use { stmt ->
                stmt.setString(1, name)
                stmt.setInt(2, categoryId)
                try {
                    stmt.executeQuery().use { rs ->
                        if (rs.next()) {
                            return Subcategory(
                                id = rs.getInt("id"),
                                name = rs.getString("name"),
                                categoryId = rs.getInt("category_id")
                            )
                        }
                    }
                } catch (e: SQLException) {
                    throw mapInsertException(
                        e,
                        "Subcategory '$name' already exists in selected category",
                        "Category with id=$categoryId does not exist"
                    )
                }
            }
        }

        throw IllegalStateException("Failed to insert subcategory")
    }

    fun categoryExists(id: Int): Boolean {
        val sql = "SELECT 1 FROM categories WHERE id = ?"
        return exists(sql) { stmt -> stmt.setInt(1, id) }
    }

    fun personExists(id: Int): Boolean {
        val sql = "SELECT 1 FROM persons WHERE id = ?"
        return exists(sql) { stmt -> stmt.setInt(1, id) }
    }

    fun subcategoryExists(categoryId: Int, subcategoryId: Int): Boolean {
        val sql = "SELECT 1 FROM subcategories WHERE id = ? AND category_id = ?"
        return exists(sql) { stmt ->
            stmt.setInt(1, subcategoryId)
            stmt.setInt(2, categoryId)
        }
    }

    private fun exists(sql: String, binder: (java.sql.PreparedStatement) -> Unit): Boolean {
        ds.connection.use { conn ->
            conn.prepareStatement(sql).use { stmt ->
                binder(stmt)
                stmt.executeQuery().use { rs ->
                    return rs.next()
                }
            }
        }
    }

    private fun mapInsertException(
        exception: SQLException,
        duplicateMessage: String,
        foreignKeyMessage: String? = null
    ): RuntimeException {
        return when (exception.sqlState) {
            "23505" -> IllegalArgumentException(duplicateMessage)
            "23503" -> IllegalArgumentException(foreignKeyMessage ?: "Invalid reference")
            else -> RuntimeException(exception)
        }
    }
}

