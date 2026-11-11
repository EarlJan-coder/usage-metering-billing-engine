import type { Metadata } from "next";

import { ApiKeysPage } from "./api-keys-page";

export const metadata: Metadata = { title: "API Keys" };

export default function ApiKeysRoutePage() {
  return <ApiKeysPage />;
}
