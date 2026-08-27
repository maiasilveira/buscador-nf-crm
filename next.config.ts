import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Upload do certificado digital (.pfx) das empresas — arquivo pequeno,
      // mas deixamos uma folga acima do 1MB padrão.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
