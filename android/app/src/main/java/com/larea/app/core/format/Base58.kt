package com.larea.app.core.format

import java.math.BigInteger

/** Bitcoin-alphabet Base58, the text form of Solana addresses and signatures. */
object Base58 {
    private const val ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    private val BASE = BigInteger.valueOf(58)

    fun encode(bytes: ByteArray): String {
        if (bytes.isEmpty()) return ""
        var value = BigInteger(1, bytes)
        val out = StringBuilder()
        while (value > BigInteger.ZERO) {
            val (quotient, remainder) = value.divideAndRemainder(BASE)
            out.append(ALPHABET[remainder.toInt()])
            value = quotient
        }
        repeat(bytes.takeWhile { it.toInt() == 0 }.size) { out.append(ALPHABET[0]) }
        return out.reverse().toString()
    }

    fun decode(text: String): ByteArray {
        var value = BigInteger.ZERO
        for (char in text) {
            val digit = ALPHABET.indexOf(char)
            require(digit >= 0) { "not Base58: $char" }
            value = value.multiply(BASE).add(BigInteger.valueOf(digit.toLong()))
        }
        val raw = value.toByteArray().dropWhile { it.toInt() == 0 }.toByteArray()
        val zeros = text.takeWhile { it == ALPHABET[0] }.length
        return ByteArray(zeros) + raw
    }

    /** "6GdtfR…i1eE" for display. */
    fun short(address: String): String = if (address.length <= 12) address else "${address.take(6)}…${address.takeLast(4)}"
}
