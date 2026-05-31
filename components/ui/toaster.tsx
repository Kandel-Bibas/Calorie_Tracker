"use client";

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  useToast,
} from "@/components/ui/toast";

/**
 * Bridges the in-module toast store (`useToast`) to rendered Radix <Toast>
 * elements. Without this, `toast(...)` calls just push to a store that nothing
 * renders — so errors (e.g. a failed sign-in) silently vanish.
 *
 * Mount ONCE at the root (app/layout.tsx) so toasts surface on every route:
 * public (login / onboarding) and authenticated alike.
 */
export function Toaster() {
  const { toasts, dismiss } = useToast();
  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, action, variant, duration, open }) => (
        <Toast
          key={id}
          variant={variant}
          duration={duration}
          open={open}
          onOpenChange={(next) => {
            if (!next) dismiss(id);
          }}
        >
          <div className="grid gap-1">
            {title ? <ToastTitle>{title}</ToastTitle> : null}
            {description ? <ToastDescription>{description}</ToastDescription> : null}
          </div>
          {action}
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
