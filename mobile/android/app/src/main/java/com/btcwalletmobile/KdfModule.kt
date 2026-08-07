package com.btcwalletmobile

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/**
 * PIN türetme için native PBKDF2-SHA256.
 * JS tarafındaki saf-JS KDF, Hermes'te yüksek iterasyonda saniyeler sürdüğü için
 * türetme platformun kendi kripto sağlayıcısına taşındı (~binlerce kat hızlı).
 */
class KdfModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "Kdf"

  override fun getConstants(): MutableMap<String, Any> = hashMapOf(
    "bitcoinNetwork" to BuildConfig.BITCOIN_NETWORK,
  )

  @ReactMethod
  fun pbkdf2Sha256(password: String, saltHex: String, iterations: Int, dkLenBytes: Int, promise: Promise) {
    val passwordChars = password.toCharArray()
    var salt: ByteArray? = null
    var key: ByteArray? = null
    var spec: PBEKeySpec? = null
    try {
      val saltBytes = saltHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
      salt = saltBytes
      spec = PBEKeySpec(passwordChars, saltBytes, iterations, dkLenBytes * 8)
      val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
      val derivedKey = factory.generateSecret(spec).encoded
      key = derivedKey
      promise.resolve(derivedKey.joinToString("") { "%02x".format(it) })
    } catch (e: Exception) {
      promise.reject("KDF_ERROR", e.localizedMessage, e)
    } finally {
      spec?.clearPassword()
      passwordChars.fill('\u0000')
      salt?.fill(0)
      key?.fill(0)
    }
  }

  /**
   * BDK'nin SQLite durumunu yedekleme kapsamı dışında kalan uygulama alanında tutar.
   * Cüzdan kimliği doğrulanır; çağıran tarafın dosya yolu enjekte etmesine izin verilmez.
   */
  @ReactMethod
  fun getWalletDatabasePath(walletId: String, promise: Promise) {
    try {
      if (!walletId.matches(Regex("^[A-Za-z0-9_-]{1,64}$"))) {
        throw IllegalArgumentException("Geçersiz cüzdan kimliği.")
      }
      val directory = File(reactApplicationContext.noBackupFilesDir, "bdk-wallets")
      if (!directory.exists() && !directory.mkdirs()) {
        throw IllegalStateException("Cüzdan veritabanı dizini oluşturulamadı.")
      }
      promise.resolve(File(directory, "$walletId.sqlite").absolutePath)
    } catch (e: Exception) {
      promise.reject("WALLET_DB_PATH_ERROR", e.localizedMessage, e)
    }
  }
}
