package db

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import javax.sql.DataSource

object Database {
    private val ds: HikariDataSource by lazy {
        val jdbcUrl = System.getenv("DB_URL") ?: "jdbc:postgresql://localhost:5432/finances"
        val user = System.getenv("DB_USER") ?: "finances_user"
        val password = System.getenv("DB_PASSWORD") ?: "change_me_please"

        val config = HikariConfig().apply {
            this.jdbcUrl = jdbcUrl
            this.username = user
            this.password = password
            this.maximumPoolSize = 4
            this.minimumIdle = 1
            this.connectionTimeout = 30_000
            this.poolName = "finances-hikari"
        }

        HikariDataSource(config)
    }

    fun dataSource(): DataSource = ds
}

