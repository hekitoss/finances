package service

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.math.BigDecimal
import java.math.RoundingMode
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.time.LocalDate
import java.util.concurrent.ConcurrentHashMap

/**
 * Converts amounts to EUR, the base currency for "all currencies" totals.
 *
 * Rates come from the free fawazahmed0 currency-api (no key; unlike ECB/Frankfurter it has RUB).
 * A rate is taken for the transaction's date; today and future dates use the latest rate.
 */
class ExchangeRateService {
    private val http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build()
    private val json = Json { ignoreUnknownKeys = true }

    /** EUR rates by date ("latest" for today); past rates never change, so they are cached for good. */
    private val cache = ConcurrentHashMap<String, Map<String, Double>>()

    /**
     * [amount] in [currency] converted to EUR, rounded to cents; null when the rate can't be fetched.
     * EUR amounts are returned as is, without a request.
     */
    fun toEur(amount: BigDecimal, currency: String, date: LocalDate): BigDecimal? {
        val code = currency.trim().uppercase()
        if (code == BASE) {
            return amount.setScale(2, RoundingMode.HALF_UP)
        }
        val rate = eurRate(code, date) ?: return null
        return amount.divide(BigDecimal.valueOf(rate), 2, RoundingMode.HALF_UP)
    }

    /** How many units of [currency] one EUR buys on [date]; null when unknown or unavailable. */
    private fun eurRate(currency: String, date: LocalDate): Double? {
        val key = if (date.isBefore(LocalDate.now())) date.toString() else "latest"
        val rates = cache[key] ?: fetchRates(key)?.also { rates ->
            // The latest rates change daily, so only dated ones are cached.
            if (key != "latest") cache[key] = rates
        }
        return rates?.get(currency.lowercase())?.takeIf { it > 0.0 }
    }

    private fun fetchRates(version: String): Map<String, Double>? {
        val urls = listOf(
            "https://$version.currency-api.pages.dev/v1/currencies/eur.min.json",
            "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@$version/v1/currencies/eur.min.json"
        )
        for (url in urls) {
            try {
                val request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(15)).GET().build()
                val response = http.send(request, HttpResponse.BodyHandlers.ofString())
                if (response.statusCode() != 200) {
                    continue
                }
                val eur = json.parseToJsonElement(response.body()).jsonObject["eur"]?.jsonObject ?: continue
                return eur.mapNotNull { (code, value) -> value.jsonPrimitive.doubleOrNull?.let { code to it } }.toMap()
            } catch (e: Exception) {
                System.err.println("Exchange rate request failed ($url): ${e.message}")
            }
        }
        return null
    }

    companion object {
        const val BASE = "EUR"
    }
}
