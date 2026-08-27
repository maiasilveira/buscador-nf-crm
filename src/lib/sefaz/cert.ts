import "server-only";
import forge from "node-forge";

// Extrai chave privada e certificado (PEM) de um arquivo .pfx/.p12 (padrão
// dos certificados A1 usados para autenticação na SEFAZ), além de metadados
// úteis para exibir na tela (razão social do titular, validade).

export type CertificadoInfo = {
  privateKeyPem: string;
  certPem: string;
  subject: string;
  validUntil: Date;
};

export function lerCertificadoPfx(pfxBuffer: Buffer, senha: string): CertificadoInfo {
  const p12Asn1 = forge.asn1.fromDer(
    forge.util.createBuffer(pfxBuffer.toString("binary"))
  );
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senha);

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag =
    keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  if (!keyBag?.key) {
    throw new Error("Não foi possível encontrar a chave privada no arquivo .pfx.");
  }

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) {
    throw new Error("Não foi possível encontrar o certificado no arquivo .pfx.");
  }

  const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);
  const certPem = forge.pki.certificateToPem(certBag.cert);
  const subject = certBag.cert.subject.attributes
    .map((a) => `${a.shortName ?? a.name}=${a.value}`)
    .join(", ");
  const validUntil = certBag.cert.validity.notAfter;

  return { privateKeyPem, certPem, subject, validUntil };
}

/** Valida a senha e o formato do .pfx antes de salvar — lança erro claro se
 * o arquivo ou a senha estiverem incorretos. */
export function validarCertificadoPfx(pfxBuffer: Buffer, senha: string): CertificadoInfo {
  try {
    return lerCertificadoPfx(pfxBuffer, senha);
  } catch {
    throw new Error(
      "Não foi possível ler o certificado: verifique se o arquivo é um .pfx/.p12 válido e se a senha está correta."
    );
  }
}
