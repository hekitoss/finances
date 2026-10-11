package dao

import model.Transaction
import model.TransactionItem
import java.math.BigDecimal
import java.sql.Connection
import java.sql.ResultSet
import java.time.LocalDate
import javax.sql.DataSource

class TransactionDao(private val ds: DataSource) {

    private val baseSelect = """
        SELECT
            t.id,
            t.transaction_date,
            t.amount,
            t.currency,
            t.person_id,
            p.name AS person,
            t.category_id,
            c.name AS category,
            t.subcategory_id,
            s.name AS sub_category,
            t.comment
        FROM transactions t
        LEFT JOIN persons p ON p.id = t.person_id
        JOIN categories c ON c.id = t.category_id
        LEFT JOIN subcategories s ON s.id = t.subcategory_id
    """.trimIndent()

    fun findAll(): List<Transaction> {
        val sql = "$baseSelect ORDER BY t.transaction_date DESC, t.id DESC"

        ds.connection.use { conn ->
            conn.prepareStatement(sql).use { stmt ->
                stmt.executeQuery().use { rs ->
                    val list = mutableListOf<Transaction>()
                    while (rs.next()) {
                        list += mapRow(rs)
                    }
                    return list
                }
            }
        }
    }

    fun findByDateRange(startDateInclusive: LocalDate, endDateExclusive: LocalDate): List<Transaction> {
        val sql = "$baseSelect WHERE t.transaction_date >= ? AND t.transaction_date < ? ORDER BY t.transaction_date DESC, t.id DESC"

        ds.connection.use { conn ->
            conn.prepareStatement(sql).use { stmt ->
                stmt.setDate(1, java.sql.Date.valueOf(startDateInclusive))
                stmt.setDate(2, java.sql.Date.valueOf(endDateExclusive))

                stmt.executeQuery().use { rs ->
                    val list = mutableListOf<Transaction>()
                    while (rs.next()) {
                        list += mapRow(rs)
                    }
                    return list
                }
            }
        }
    }

    fun findById(id: Int): Transaction? {
        val sql = "$baseSelect WHERE t.id = ?"

        ds.connection.use { conn ->
            conn.prepareStatement(sql).use { stmt ->
                stmt.setInt(1, id)
                stmt.executeQuery().use { rs ->
                    return if (rs.next()) mapRow(rs) else null
                }
            }
        }
    }

    fun insert(
        transactionDate: LocalDate,
        amount: BigDecimal,
        currency: String,
        personId: Int?,
        categoryId: Int,
        subcategoryId: Int?,
        comment: String?
    ): Transaction {
        ds.connection.use { conn ->
            return insertOn(conn, transactionDate, amount, currency, personId, categoryId, subcategoryId, comment)
        }
    }

    /** Inserts a transaction together with its line items in one DB transaction. */
    fun insertWithItems(
        transactionDate: LocalDate,
        amount: BigDecimal,
        currency: String,
        personId: Int?,
        categoryId: Int,
        subcategoryId: Int?,
        comment: String?,
        items: List<TransactionItem>
    ): Transaction {
        val itemSql = """
            INSERT INTO transaction_items (transaction_id, position, name, amount, category_id, subcategory_id)
            VALUES (?, ?, ?, ?, ?, ?)
        """.trimIndent()

        ds.connection.use { conn ->
            val autoCommit = conn.autoCommit
            conn.autoCommit = false
            try {
                val transaction = insertOn(conn, transactionDate, amount, currency, personId, categoryId, subcategoryId, comment)
                conn.prepareStatement(itemSql).use { stmt ->
                    items.forEachIndexed { index, item ->
                        stmt.setInt(1, transaction.id)
                        stmt.setInt(2, index + 1)
                        stmt.setString(3, item.name)
                        stmt.setBigDecimal(4, item.amount)
                        if (item.categoryId != null) stmt.setInt(5, item.categoryId) else stmt.setNull(5, java.sql.Types.INTEGER)
                        if (item.subcategoryId != null) stmt.setInt(6, item.subcategoryId) else stmt.setNull(6, java.sql.Types.INTEGER)
                        stmt.addBatch()
                    }
                    stmt.executeBatch()
                }
                conn.commit()
                return transaction
            } catch (e: Exception) {
                conn.rollback()
                throw e
            } finally {
                conn.autoCommit = autoCommit
            }
        }
    }

    private fun insertOn(
        conn: Connection,
        transactionDate: LocalDate,
        amount: BigDecimal,
        currency: String,
        personId: Int?,
        categoryId: Int,
        subcategoryId: Int?,
        comment: String?
    ): Transaction {
        val sql = """
            WITH inserted AS (
                INSERT INTO transactions (transaction_date, amount, currency, person_id, category_id, subcategory_id, comment)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                RETURNING id, transaction_date, amount, currency, person_id, category_id, subcategory_id, comment
            )
            SELECT
                i.id,
                i.transaction_date,
                i.amount,
                i.currency,
                i.person_id,
                p.name AS person,
                i.category_id,
                c.name AS category,
                i.subcategory_id,
                s.name AS sub_category,
                i.comment
            FROM inserted i
            LEFT JOIN persons p ON p.id = i.person_id
            JOIN categories c ON c.id = i.category_id
            LEFT JOIN subcategories s ON s.id = i.subcategory_id
        """.trimIndent()

        conn.prepareStatement(sql).use { stmt ->
            stmt.setDate(1, java.sql.Date.valueOf(transactionDate))
            stmt.setBigDecimal(2, amount)
            stmt.setString(3, currency)
            if (personId != null) stmt.setInt(4, personId) else stmt.setNull(4, java.sql.Types.INTEGER)
            stmt.setInt(5, categoryId)
            if (subcategoryId != null) stmt.setInt(6, subcategoryId) else stmt.setNull(6, java.sql.Types.INTEGER)
            if (comment != null) stmt.setString(7, comment) else stmt.setNull(7, java.sql.Types.VARCHAR)

            stmt.executeQuery().use { rs ->
                if (rs.next()) {
                    return mapRow(rs)
                } else {
                    throw IllegalStateException("Failed to insert transaction")
                }
            }
        }
    }

    fun delete(id: Int): Boolean {
        val sql = "DELETE FROM transactions WHERE id = ?"
        ds.connection.use { conn ->
            conn.prepareStatement(sql).use { stmt ->
                stmt.setInt(1, id)
                val rowsAffected = stmt.executeUpdate()
                return rowsAffected > 0
            }
        }
    }

    fun update(
        id: Int,
        transactionDate: LocalDate,
        amount: BigDecimal,
        currency: String,
        personId: Int?,
        categoryId: Int,
        subcategoryId: Int?,
        comment: String?
    ): Transaction? {
        val sql = """
            WITH updated AS (
                UPDATE transactions
                SET transaction_date = ?,
                    amount = ?,
                    currency = ?,
                    person_id = ?,
                    category_id = ?,
                    subcategory_id = ?,
                    comment = ?
                WHERE id = ?
                RETURNING id, transaction_date, amount, currency, person_id, category_id, subcategory_id, comment
            )
            SELECT
                u.id,
                u.transaction_date,
                u.amount,
                u.currency,
                u.person_id,
                p.name AS person,
                u.category_id,
                c.name AS category,
                u.subcategory_id,
                s.name AS sub_category,
                u.comment
            FROM updated u
            LEFT JOIN persons p ON p.id = u.person_id
            JOIN categories c ON c.id = u.category_id
            LEFT JOIN subcategories s ON s.id = u.subcategory_id
        """.trimIndent()

        ds.connection.use { conn ->
            conn.prepareStatement(sql).use { stmt ->
                stmt.setDate(1, java.sql.Date.valueOf(transactionDate))
                stmt.setBigDecimal(2, amount)
                stmt.setString(3, currency)
                if (personId != null) stmt.setInt(4, personId) else stmt.setNull(4, java.sql.Types.INTEGER)
                stmt.setInt(5, categoryId)
                if (subcategoryId != null) stmt.setInt(6, subcategoryId) else stmt.setNull(6, java.sql.Types.INTEGER)
                if (comment != null) stmt.setString(7, comment) else stmt.setNull(7, java.sql.Types.VARCHAR)
                stmt.setInt(8, id)

                stmt.executeQuery().use { rs ->
                    return if (rs.next()) mapRow(rs) else null
                }
            }
        }
    }

    private fun mapRow(rs: ResultSet): Transaction {
        val id = rs.getInt("id")
        val date = rs.getDate("transaction_date")?.toLocalDate() ?: LocalDate.MIN
        val amount = rs.getBigDecimal("amount") ?: BigDecimal.ZERO
        val currency = rs.getString("currency")
        val personId = rs.getInt("person_id").takeUnless { rs.wasNull() }
        val person = rs.getString("person")
        val categoryId = rs.getInt("category_id")
        val category = rs.getString("category")
        val subcategoryId = rs.getInt("subcategory_id").takeUnless { rs.wasNull() }
        val subCategory = rs.getString("sub_category")
        val comment = rs.getString("comment")

        return Transaction(
            id = id,
            transactionDate = date,
            amount = amount,
            currency = currency,
            personId = personId,
            person = person,
            categoryId = categoryId,
            category = category,
            subcategoryId = subcategoryId,
            subCategory = subCategory,
            comment = comment
        )
    }
}
