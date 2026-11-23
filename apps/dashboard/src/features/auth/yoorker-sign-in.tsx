import { useRouter } from "@/kit/framework";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, SmartphoneIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "cn";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { api, ApiError } from "@/lib/api";
import type { Me } from "@/lib/yoorker";
import { DEV_NOTES } from "@/lib/dev-notes";

import { AuthHeader } from "./auth-shell";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_SCRIPT = "https://accounts.google.com/gsi/client";

function loadGoogle(): Promise<void> {
  if (window.google) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script =
      document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT}"]`) ??
      Object.assign(document.createElement("script"), { src: GOOGLE_SCRIPT, async: true });
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Google sign-in failed to load")), {
      once: true,
    });
    if (!script.isConnected) document.head.appendChild(script);
  });
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(options: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }): void;
          renderButton(element: HTMLElement, options: Record<string, unknown>): void;
        };
      };
    };
  }
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="size-4">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

export function YoorkerSignIn() {
  const router = useRouter();
  const client = useQueryClient();
  const [phone, setPhone] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googleButton = useRef<HTMLDivElement>(null);
  const [googleReady, setGoogleReady] = useState(false);

  const signedIn = useCallback(
    (me: Me) => {
      client.setQueryData(["me"], me);
      router.replace("/");
    },
    [client, router],
  );

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Is the API running on port 4000?",
      );
    } finally {
      setBusy(false);
    }
  };

  // Google's button is drawn once its script has loaded. `run` and `signedIn` are stable for
  // the life of the form, so this runs once.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    loadGoogle()
      .then(() => {
        if (cancelled || !window.google || !googleButton.current) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: ({ credential }) =>
            run(async () =>
              signedIn(await api<Me>("/auth/google", { body: { idToken: credential } })),
            ),
        });
        // Google's own button lives in a cross-origin iframe we can't style, so it sits
        // invisibly over our button and takes the click. Same width and height as ours.
        const width = Math.round(googleButton.current.getBoundingClientRect().width);
        window.google.accounts.id.renderButton(googleButton.current, {
          theme: "outline",
          size: "medium",
          width: Math.min(400, Math.max(200, width)),
          text: "continue_with",
        });
        setGoogleReady(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <AuthHeader
        title="Sign in to Yoorker"
        description="Manage your venues, courts, prices and bookings."
      />
      {GOOGLE_CLIENT_ID && (
        <>
          <div className="group/google relative">
            <div
              aria-hidden
              className={cn(
                buttonVariants({ variant: "outline" }),
                "pointer-events-none w-full",
                "group-hover/google:bg-muted dark:group-hover/google:bg-input/50",
                "group-focus-within/google:border-ring group-focus-within/google:ring-3 group-focus-within/google:ring-ring/50",
                !googleReady && "opacity-50",
              )}
            >
              <GoogleMark />
              Continue with Google
            </div>
            <div
              ref={googleButton}
              className="absolute inset-0 overflow-hidden opacity-0 [color-scheme:light]"
            />
          </div>
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or with your mobile
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      {challenge === null ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              const res = await api<{ challengeId: string }>("/auth/otp/request", {
                body: { phone },
              });
              setChallenge(res.challengeId);
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">Mobile number</Label>
            <Input
              id="phone"
              inputMode="tel"
              autoComplete="tel"
              placeholder="98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={busy || phone.trim().length < 10}>
            {busy ? <Spinner /> : <SmartphoneIcon data-icon="inline-start" />}
            Send code
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            run(async () =>
              signedIn(
                await api<Me>("/auth/otp/verify", {
                  body: { challengeId: challenge, code },
                }),
              ),
            );
          }}
        >
          <div className="flex flex-col gap-2">
            <Label>Enter the 6-digit code</Label>
            <InputOTP maxLength={6} value={code} onChange={setCode} autoFocus>
              <InputOTPGroup>
                {Array.from({ length: 6 }, (_, i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            {DEV_NOTES && (
              <p className="text-xs text-muted-foreground">
                Local demo: the API prints it as “OTP for +91••••••
                {phone.slice(-4)}: ……”.
              </p>
            )}
          </div>
          <Button type="submit" disabled={busy || code.length !== 6}>
            {busy && <Spinner />}
            Sign in
          </Button>
          <Button type="button" variant="ghost" onClick={() => (setChallenge(null), setCode(""))}>
            <ArrowLeftIcon data-icon="inline-start" />
            Use another number
          </Button>
        </form>
      )}
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </div>
  );
}
