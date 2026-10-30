package dao

import model.Transaction
import model.TransactionItem
import model.TransactionItemDetails
import java.math.BigDecimal
import java.sql.Connection
import java.sql.ResultSet
import java.time.LocalDate
import javax.sql.DataSource

class TransactionDao(private val ds: DataSource) {

    /** Tag names and ids of the transaction [idColumn], both sorted by tag name; empty arrays when it has none. */
    private fun tagColumns(idColumn: String) = """
        ARRAY(SELECT tg.name FROM transaction_tags tt JOIN tags tg ON tg.id = tt.tag_id WHERE tt.transaction_id = $idColumn ORDER BY tg.name, tg.id) AS tags,
        ARRAY(SELECT tg.id FROM transaction_tags tt JOIN tags tg ON tg.id = tt.tag_id WHERE tt.transaction_id = $idColumn ORDER BY tg.name, tg.id) AS tag_ids
    """.trimIndent()

    private val baseSelect = """
        SELECT
            t.id,
            t.transaction_date,
            t.amount,
            t.currency,
            t.amount_eur,
            t.person_id,
            p.name AS person,
            t.category_id,
            c.name AS category,
            t.subcategory_id,
            s.name AS sub_category,
            t.comment,
            (SELECT count(*) FROM transaction_items ti WHERE ti.transaction_id = t.id) AS items_count,
            ${tagColumns("t.id")}
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
        ds.connection.use { conn ->
            return findByIdOn(conn, id)
        }
    }

    private fun findByIdOn(conn: Connection, id: Int): Transaction? {
        val sql = "$baseSelect WHERE t.id = ?"

        conn.prepareStatement(sql).use { stmt ->
            stmt.setInt(1, id)
            stmt.executeQuery().use { rs ->
                return if (rs.next()) mapRow(rs) else null
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
        comment: String?,
        amountEur: BigDecimal?,
        tagIds: List<Int> = emptyList()
    ): Transaction = inTransaction { conn ->
        val transaction = insertOn(conn, transactionDate, amount, currency, personId, categoryId, subcategoryId, comment, amountEur)
        if (tagIds.isEmpty()) {
            transaction
        } else {
            replaceTags(conn, transaction.id, tagIds)
            findByIdOn(conn, transaction.id)!!
        }
    }

    /** Runs [block] in one DB transaction, rolling back on any exception. */
    private fun <T> inTransaction(block: (Connection) -> T): T {
        ds.connection.use { conn ->
            val autoCommit = conn.autoCommit
            conn.autoCommit = false
            try {
                val result = block(conn)
                conn.commit()
                return result
            } catch (e: Exception) {
                conn.rollback()
                throw e
            } finally {
                conn.autoCommit = autoCommit
            }
        }
    }

    /** Sets the transaction's tags to exactly [tagIds]. */
    private fun replaceTags(conn: Connection, transactionId: Int, tagIds: List<Int>) {
        conn.prepareStatement("DELETE FROM transaction_tags WHERE transaction_id = ?").use { stmt ->
            stmt.setInt(1, transactionId)
            stmt.executeUpdate()
        }
        if (tagIds.isEmpty()) {
            return
        }
        conn.prepareStatement("INSERT INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?) ON CONFLICT DO NOTHING").use { stmt ->
            tagIds.forEach { tagId ->
                stmt.setInt(1, transactionId)
                stmt.setInt(2, tagId)
                stmt.addBatch()
            }
            stmt.executeBatch()
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
        amountEur: BigDecimal?,
        items: List<TransactionItem>,
        tagIds: List<Int> = emptyList()
    ): Transaction {
        val itemSql = """
            INSERT INTO transaction_items (transaction_id, position, name, amount, category_id, subcategory_id)
            VALUES (?, ?, ?, ?, ?, ?)
        """.trimIndent()

        ds.connection.use { conn ->
            val autoCommit = conn.autoCommit
            conn.autoCommit = false
            try {
                val transaction = insertOn(conn, transactionDate, amount, currency, personId, categoryId, subcategoryId, comment, amountEur)
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
                replaceTags(conn, transaction.id, tagIds)
                val saved = findByIdOn(conn, transaction.id)!!
                conn.commit()
                return saved
            } catch (e: Exception) {
                conn.rollback()
                throw e
            } finally {
                conn.autoCommit = autoCommit
            }
        }
    }

    fun findItems(transactionId: Int): List<TransactionItemDetails> {
        val sql = """
            SELECT ti.id, ti.position, ti.name, ti.amount, c.name AS category, s.name AS sub_category
            FROM transaction_items ti
            LEFT JOIN categories c ON c.id = ti.category_id
            LEFT JOIN subcategories s ON s.id = ti.subcategory_id
            WHERE ti.transaction_id = ?
            ORDER BY ti.position, ti.id
        """.trimIndent()

        ds.connection.use { conn ->
            conn.prepareStatement(sql).use { stmt ->
                stmt.setInt(1, transactionId)
                stmt.executeQuery().use { rs ->
                    val list = mutableListOf<TransactionItemDetails>()
                    while (rs.next()) {
                        list += TransactionItemDetails(
                            id = rs.getInt("id"),
                            position = rs.getInt("position"),
                            name = rs.getString("name"),
                            amount = rs.getBigDecimal("amount"),
                            category = rs.getString("category"),
                            subCategory = rs.getString("sub_category")
                        )
                    }
                    return list
                }
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
        comment: String?,
        amountEur: BigDecimal?
    ): Transaction {
        val sql = """
            WITH inserted AS (
                INSERT INTO transactions (transaction_date, amount, currency, person_id, category_id, subcategory_id, comment, amount_eur)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id, transaction_date, amount, currency, amount_eur, person_id, category_id, subcategory_id, comment
            )
            SELECT
                i.id,
                i.transaction_date,
                i.amount,
                i.currency,
                i.amount_eur,
                i.person_id,
                p.name AS person,
                i.category_id,
                c.name AS category,
                i.subcategory_id,
                s.name AS sub_category,
                i.comment,
                0 AS items_count,
                ARRAY[]::varchar[] AS tags,
                ARRAY[]::integer[] AS tag_ids
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
            if (amountEur != null) stmt.setBigDecimal(8, amountEur) else stmt.setNull(8, java.sql.Types.NUMERIC)

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
        comment: String?,
        amountEur: BigDecimal?,
        tagIds: List<Int>? = null
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
                    comment = ?,
                    amount_eur = ?
                WHERE id = ?
                RETURNING id, transaction_date, amount, currency, amount_eur, person_id, category_id, subcategory_id, comment
            )
            SELECT
                u.id,
                u.transaction_date,
                u.amount,
                u.currency,
                u.amount_eur,
                u.person_id,
                p.name AS person,
                u.category_id,
                c.name AS category,
                u.subcategory_id,
                s.name AS sub_category,
                u.comment,
                (SELECT count(*) FROM transaction_items ti WHERE ti.transaction_id = u.id) AS items_count,
                ${tagColumns("u.id")}
            FROM updated u
            LEFT JOIN persons p ON p.id = u.person_id
            JOIN categories c ON c.id = u.category_id
            LEFT JOIN subcategories s ON s.id = u.subcategory_id
        """.trimIndent()

        return inTransaction { conn ->
            val updated = conn.prepareStatement(sql).use { stmt ->
                stmt.setDate(1, java.sql.Date.valueOf(transactionDate))
                stmt.setBigDecimal(2, amount)
                stmt.setString(3, currency)
                if (personId != null) stmt.setInt(4, personId) else stmt.setNull(4, java.sql.Types.INTEGER)
                stmt.setInt(5, categoryId)
                if (subcategoryId != null) stmt.setInt(6, subcategoryId) else stmt.setNull(6, java.sql.Types.INTEGER)
                if (comment != null) stmt.setString(7, comment) else stmt.setNull(7, java.sql.Types.VARCHAR)
                if (amountEur != null) stmt.setBigDecimal(8, amountEur) else stmt.setNull(8, java.sql.Types.NUMERIC)
                stmt.setInt(9, id)

                stmt.executeQuery().use { rs ->
                    if (rs.next()) mapRow(rs) else null
                }
            }
            if (updated == null || tagIds == null) {
                updated
            } else {
                replaceTags(conn, id, tagIds)
                findByIdOn(conn, id)
            }
        }
    }

    /** Rows whose EUR amount is not known yet (added before conversion existed, or while rates were unavailable). */
    fun findMissingAmountEur(): List<Transaction> {
        val sql = "$baseSelect WHERE t.amount_eur IS NULL ORDER BY t.transaction_date, t.id"

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

    /** Sets the EUR amount only if it is still empty, so a concurrent edit is never overwritten. */
    fun fillAmountEur(id: Int, amountEur: BigDecimal): Boolean {
        val sql = "UPDATE transactions SET amount_eur = ? WHERE id = ? AND amount_eur IS NULL"
        ds.connection.use { conn ->
            conn.prepareStatement(sql).use { stmt ->
                stmt.setBigDecimal(1, amountEur)
                stmt.setInt(2, id)
                return stmt.executeUpdate() > 0
            }
        }
    }

    private fun mapRow(rs: ResultSet): Transaction {
        val id = rs.getInt("id")
        val date = rs.getDate("transaction_date")?.toLocalDate() ?: LocalDate.MIN
        val amount = rs.getBigDecimal("amount") ?: BigDecimal.ZERO
        val currency = rs.getString("currency")
        val amountEur = rs.getBigDecimal("amount_eur")
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
            amountEur = amountEur,
            personId = personId,
            person = person,
            categoryId = categoryId,
            category = category,
            subcategoryId = subcategoryId,
            subCategory = subCategory,
            comment = comment,
            itemsCount = rs.getInt("items_count"),
            tags = (rs.getArray("tags").array as Array<*>).map { it as String },
            tagIds = (rs.getArray("tag_ids").array as Array<*>).map { (it as Number).toInt() }
        )
    }
}
