import { createCipheriv, createDecipheriv, randomBytes, createHmac } from "node:crypto";
import { readFile, open } from "node:fs/promises";
import { resolve } from "node:path";
import { DATA } from "../lib/paths.js";

export function sealStock(value: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64")).join(".");
}
export const stockFingerprint = (value: string, key: Buffer) => createHmac("sha256", key).update(value).digest("hex");
export function unsealStock(value: string, key: Buffer) {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64"));
  const cipher = createDecipheriv("aes-256-gcm", key, iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(encrypted), cipher.final()]).toString("utf8");
}
export async function storeKey(create = false): Promise<Buffer> {
  const path = resolve(DATA, "stock.key");
  let value: string;
  try { value = await readFile(path, "utf8"); }
  catch (error) {
    if (!create || (error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Chave privada do estoque indisponivel. Nao gere outra chave para estoque existente.");
    const key = randomBytes(32).toString("hex");
    try {
      const file = await open(path, "wx", 0o600);
      try { await file.writeFile(key); } finally { await file.close(); }
      value = key;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      value = await readFile(path, "utf8");
    }
  }
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("Chave privada do estoque invalida.");
  return Buffer.from(value, "hex");
}
