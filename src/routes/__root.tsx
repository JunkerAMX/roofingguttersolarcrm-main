import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { RouteLoadingGate } from "@/components/route-pending-indicator";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-foreground">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">Page not found.</p>
        <a href="/" className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all duration-200 ease-out hover:-translate-y-px hover:shadow-md active:scale-[0.97]">Go home</a>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "root" }); }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button onClick={() => { router.invalidate(); reset(); }} className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all duration-200 ease-out hover:-translate-y-px hover:shadow-md active:scale-[0.97]">Try again</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Roofing.Gutter.Solar CRM" },
      { name: "description", content: "Field CRM for Roofing.Gutter.Solar — daily jobs, checklists, and payment tracking for gutter cleaning crews." },
      { property: "og:title", content: "Roofing.Gutter.Solar CRM" },
      { property: "og:description", content: "Field CRM for Roofing.Gutter.Solar — daily jobs, checklists, and payment tracking for gutter cleaning crews." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Roofing.Gutter.Solar CRM" },
      { name: "twitter:description", content: "Field CRM for Roofing.Gutter.Solar — daily jobs, checklists, and payment tracking for gutter cleaning crews." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d0ced0a6-2946-4a2d-92cf-c21a9bd9e60e/id-preview-567e2c35--77274fab-dc13-43f2-8400-da2376e5f70d.lovable.app-1783478343466.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d0ced0a6-2946-4a2d-92cf-c21a9bd9e60e/id-preview-567e2c35--77274fab-dc13-43f2-8400-da2376e5f70d.lovable.app-1783478343466.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    const stored = (localStorage.getItem("theme") as "light" | "dark" | "system" | null) ?? "system";
    const isDark = stored === "dark" || (stored === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onMq = () => {
      const cur = (localStorage.getItem("theme") as "light" | "dark" | "system" | null) ?? "system";
      if (cur === "system") document.documentElement.classList.toggle("dark", mq.matches);
    };
    mq.addEventListener("change", onMq);
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => { sub.subscription.unsubscribe(); mq.removeEventListener("change", onMq); };
  }, [queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouteLoadingGate>
        <Outlet />
      </RouteLoadingGate>
      <Toaster position="top-center" richColors closeButton expand visibleToasts={4} />
    </QueryClientProvider>
  );
}
