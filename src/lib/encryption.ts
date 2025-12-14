import crypto from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16
const SALT_LENGTH = 64

/**
 * Get encryption key from environment variable
 * Must be 32 bytes (256 bits) for AES-256
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is required")
  }

  // If key is hex string, convert it
  if (key.length === 64) {
    return Buffer.from(key, "hex")
  }

  // Otherwise, derive key using PBKDF2
  const salt = Buffer.from(key.slice(0, SALT_LENGTH), "utf8")
  return crypto.pbkdf2Sync(key, salt, 100000, 32, "sha256")
}

/**
 * Encrypt a string value
 * Returns base64 encoded string: iv:authTag:encryptedData
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    return ""
  }

  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, "utf8", "base64")
  encrypted += cipher.final("base64")
  const authTag = cipher.getAuthTag()

  // Format: iv:authTag:encryptedData (all base64)
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`
}

/**
 * Decrypt an encrypted string
 * Expects format: iv:authTag:encryptedData (all base64)
 */
export function decrypt(encrypted: string): string {
  if (!encrypted) {
    return ""
  }

  try {
    const key = getEncryptionKey()
    const parts = encrypted.split(":")
    
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted format")
    }

    const [ivBase64, authTagBase64, encryptedData] = parts
    const iv = Buffer.from(ivBase64, "base64")
    const authTag = Buffer.from(authTagBase64, "base64")

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encryptedData, "base64", "utf8")
    decrypted += decipher.final("utf8")

    return decrypted
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

