import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Cifra usada para guardar em repouso o certificado digital (.pfx) e a senha
// de cada empresa — o banco de dados nunca guarda esses segredos em texto
// claro. Chave única de 32 bytes (AES-256-GCM), vinda de ENCRYPTION_KEY.
//
// Gere uma chave com: openssl rand -hex 32

function key(): Buffer {
  const value = process.env.ENCRYPTION_KEY;
  if (!value) {
    throw new Error("ENCRYPTION_KEY não configurado no ambiente.");
  }
  const buf = Buffer.from(value, "hex");
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY precisa ter 32 bytes em hex (64 caracteres).");
  }
  return buf;
}

const IV_LENGTH = 12; // recomendado para GCM

/** Cópia de um Buffer num Uint8Array<ArrayBuffer> "puro" — o tipo exato que
 * o Prisma Client espera para campos `Bytes`. Um `Buffer` comum não é
 * atribuível a ele diretamente (seu `ArrayBufferLike` genérico também
 * aceita `SharedArrayBuffer`, mais amplo que o `ArrayBuffer` do Prisma). */
function toUint8Array(buf: Buffer): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(buf.length);
  out.set(buf);
  return out;
}

/** Cifra um buffer arbitrário (ex: conteúdo do .pfx). Formato de saída:
 * iv (12 bytes) || authTag (16 bytes) || ciphertext. */
export function encryptBuffer(plain: Buffer): Uint8Array<ArrayBuffer> {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return toUint8Array(Buffer.concat([iv, authTag, ciphertext]));
}

export function decryptBuffer(encrypted: Uint8Array): Buffer {
  const buf = Buffer.from(encrypted);
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = buf.subarray(IV_LENGTH + 16);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptString(plain: string): string {
  return Buffer.from(encryptBuffer(Buffer.from(plain, "utf8"))).toString("base64");
}

export function decryptString(encrypted: string): string {
  return decryptBuffer(Buffer.from(encrypted, "base64")).toString("utf8");
}
