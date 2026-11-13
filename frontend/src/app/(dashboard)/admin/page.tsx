import type { Metadata } from "next";

import { AdminPage } from "./admin-page";

export const metadata: Metadata = { title: "Platform Admin" };

export default function AdminPageRoute() {
  return <AdminPage />;
}
