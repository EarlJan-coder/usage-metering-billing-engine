"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { breadcrumbTrail } from "@/components/layout/breadcrumbs";
import { useSession } from "@/lib/auth/session";

/** Header breadcrumb: workspace › current page (frontend-plan §5). */
export function BreadcrumbBar() {
  const pathname = usePathname();
  const { tenant } = useSession();
  const trail = breadcrumbTrail(pathname);
  const workspaceName = tenant?.name ?? "Workspace";

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/overview">{workspaceName}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {trail.map((crumb) => (
          <BreadcrumbItem key={crumb.href}>
            <BreadcrumbSeparator aria-hidden="true" />
            <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
          </BreadcrumbItem>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
