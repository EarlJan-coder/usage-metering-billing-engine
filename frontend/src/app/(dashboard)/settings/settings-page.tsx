"use client";

import { useTheme } from "next-themes";
import { LogOut, Monitor, Moon, Shield, User, Sun, Building2 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSession } from "@/lib/auth/session";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/**
 * Settings page (frontend-plan §6H + Phase 9): profile, workspace,
 * theme, and security. Profile/workspace data comes from the session
 * (GET /auth/me); the backend contract exposes no profile or password
 * mutation endpoints, so those sections state that honestly instead of
 * faking editable forms.
 */
export function SettingsPage() {
  const { user, tenant, signOut } = useSession();
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Account, workspace, theme, and security preferences."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {/* Profile information (read-only — no backend update endpoint) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="size-4" aria-hidden="true" />
              Profile
            </CardTitle>
            <CardDescription>
              Your account as reported by the backend session.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <p className="text-lg font-semibold">
                {user?.name ?? "Not signed in"}
              </p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Role
              </span>
              <Badge variant="outline">
                {user?.role === "admin" ? "Admin" : "Member"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Profile editing is not available on this deployment — the
              backend API does not expose a profile update endpoint.
            </p>
          </CardContent>
        </Card>

        {/* Workspace information from the session */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-4" aria-hidden="true" />
              Workspace
            </CardTitle>
            <CardDescription>
              The tenant your session is currently operating in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tenant ? (
              <>
                <div className="space-y-1">
                  <p className="text-lg font-semibold">{tenant.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Plan
                    </span>
                    <Badge variant="secondary">
                      {tenant.plan ?? "Not reported"}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Workspace ID
                  </span>
                  <p className="font-mono text-sm">{tenant.id}</p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No workspace reported by your session.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Theme preferences (frontend-plan §4/§5 — light default) */}
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>
              Choose how the dashboard looks. Stored in your browser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {THEME_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant={theme === option.value ? "default" : "outline"}
                  aria-pressed={theme === option.value}
                  onClick={() => setTheme(option.value)}
                >
                  <option.icon className="size-4" aria-hidden="true" />
                  {option.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Security settings — honest about missing backend capability */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="size-4" aria-hidden="true" />
              Security
            </CardTitle>
            <CardDescription>
              Session and credential controls for your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Password changes are not available on this deployment — the
              backend API does not expose a password change endpoint.
            </p>
            <Button variant="outline" onClick={() => void signOut()}>
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
