"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addHours, format, parseISO } from "date-fns";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import type { SocialPlatform } from "@/models/types";

const platformOptions: Array<{
  id: SocialPlatform;
  label: string;
  accentClassName: string;
  characterLimit: number;
}> = [
  { id: "X", label: "X", accentClassName: "border-zinc-900 bg-zinc-900 text-white", characterLimit: 280 },
  {
    id: "LINKEDIN",
    label: "LinkedIn",
    accentClassName: "border-blue-600 bg-blue-600 text-white",
    characterLimit: 3000,
  },
  {
    id: "INSTAGRAM",
    label: "Instagram",
    accentClassName: "border-pink-500 bg-pink-500 text-white",
    characterLimit: 2200,
  },
];

interface SchedulePostApiRequest {
  content: string;
  mediaUrls: string[];
  targetPlatforms: SocialPlatform[];
  scheduledExecutionTime: string;
}

interface SchedulePostApiResponse {
  status: string;
  message: string;
  postId?: string;
  queueJobId?: string;
  error?: string;
}

interface SocialIdentityStatus {
  platform: SocialPlatform;
  connected: boolean;
  platformUserIdMasked?: string;
  updatedAt?: string;
}

interface SocialIdentityStatusApiResponse {
  status: string;
  identities: SocialIdentityStatus[];
  message?: string;
  error?: string;
}

interface UpsertSocialIdentityApiRequest {
  platform: SocialPlatform;
  platformUserId: string;
  accessToken: string;
  refreshToken?: string;
  scopes: string[];
}

interface SocialIdentityMutationApiResponse {
  status: string;
  message: string;
  identity?: SocialIdentityStatus;
  error?: string;
}

type SubmitFeedback =
  | {
      type: "idle";
      message: "";
    }
  | {
      type: "success" | "error";
      message: string;
    };

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function toDateTimeLocalInputValue(value: Date): string {
  return format(value, "yyyy-MM-dd'T'HH:mm");
}

function getCounterToneClassName(remaining: number): string {
  if (remaining < 0) {
    return "text-rose-700";
  }

  if (remaining <= 40) {
    return "text-amber-700";
  }

  return "text-emerald-700";
}

function getCounterRailClassName(remaining: number): string {
  if (remaining < 0) {
    return "bg-rose-500";
  }

  if (remaining <= 40) {
    return "bg-amber-500";
  }

  return "bg-emerald-500";
}

function combineClassNames(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

function createInitialConnectionMap(): Record<SocialPlatform, boolean> {
  return {
    X: false,
    LINKEDIN: false,
    INSTAGRAM: false,
  };
}

function createInitialHintMap(): Record<SocialPlatform, string> {
  return {
    X: "",
    LINKEDIN: "",
    INSTAGRAM: "",
  };
}

function getPlatformUserIdLabel(platform: SocialPlatform): string {
  if (platform === "LINKEDIN") {
    return "LinkedIn Person ID";
  }

  if (platform === "INSTAGRAM") {
    return "Instagram username";
  }

  return "X username or user ID";
}

function getAccessTokenLabel(platform: SocialPlatform): string {
  if (platform === "INSTAGRAM") {
    return "Instagram session ID / token";
  }

  return "Access token";
}

export function PostComposer() {
  const [title, setTitle] = useState("");
  const [contentHtml, setContentHtml] = useState("<p></p>");
  const [mediaUrls, setMediaUrls] = useState<string[]>([""]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>(["X", "LINKEDIN", "INSTAGRAM"]);
  const [scheduledForLocal, setScheduledForLocal] = useState(() => toDateTimeLocalInputValue(addHours(new Date(), 1)));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<SubmitFeedback>({
    type: "idle",
    message: "",
  });
  const [connectionMap, setConnectionMap] = useState<Record<SocialPlatform, boolean>>(() => createInitialConnectionMap());
  const [platformHintMap, setPlatformHintMap] = useState<Record<SocialPlatform, string>>(() => createInitialHintMap());
  const [isLoadingConnections, setIsLoadingConnections] = useState(true);
  const [isSavingCredentials, setIsSavingCredentials] = useState(false);
  const [credentialsPlatform, setCredentialsPlatform] = useState<SocialPlatform>("X");
  const [credentialsUserId, setCredentialsUserId] = useState("");
  const [credentialsAccessToken, setCredentialsAccessToken] = useState("");
  const [credentialsRefreshToken, setCredentialsRefreshToken] = useState("");
  const [credentialsScopes, setCredentialsScopes] = useState("");
  const [credentialsFeedback, setCredentialsFeedback] = useState<SubmitFeedback>({
    type: "idle",
    message: "",
  });

  const cleanMediaUrls = useMemo(
    () => mediaUrls.map((item) => item.trim()).filter((item) => item.length > 0),
    [mediaUrls],
  );

  const loadConnectionStatus = useCallback(async () => {
    setIsLoadingConnections(true);

    try {
      const response = await fetch("/api/social-identities", {
        method: "GET",
        cache: "no-store",
      });

      let responseBody: SocialIdentityStatusApiResponse | null = null;

      try {
        responseBody = (await response.json()) as SocialIdentityStatusApiResponse;
      } catch {
        responseBody = null;
      }

      if (!response.ok || !responseBody || !Array.isArray(responseBody.identities)) {
        throw new Error(responseBody?.message ?? "Unable to load social account connections.");
      }

      const nextConnectionMap = createInitialConnectionMap();
      const nextHintMap = createInitialHintMap();

      for (const identity of responseBody.identities) {
        nextConnectionMap[identity.platform] = Boolean(identity.connected);
        nextHintMap[identity.platform] = identity.platformUserIdMasked ?? "";
      }

      setConnectionMap(nextConnectionMap);
      setPlatformHintMap(nextHintMap);
    } catch (error) {
      setConnectionMap(createInitialConnectionMap());
      setPlatformHintMap(createInitialHintMap());
      setCredentialsFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to load social account connections.",
      });
    } finally {
      setIsLoadingConnections(false);
    }
  }, []);

  useEffect(() => {
    void loadConnectionStatus();
  }, [loadConnectionStatus]);

  const previewText = useMemo(() => stripHtml(contentHtml), [contentHtml]);
  const textLength = previewText.length;
  const contentIsEmpty = previewText.trim().length === 0;

  const selectedPlatformCounters = useMemo(
    () =>
      platformOptions
        .filter((platform) => selectedPlatforms.includes(platform.id))
        .map((platform) => {
          const remaining = platform.characterLimit - textLength;

          return {
            ...platform,
            remaining,
            isExceeded: remaining < 0,
          };
        }),
    [selectedPlatforms, textLength],
  );

  const hasContentOverflow = selectedPlatformCounters.some((counter) => counter.isExceeded);

  const scheduledDate = useMemo(() => {
    if (!scheduledForLocal) {
      return null;
    }

    const parsed = parseISO(scheduledForLocal);

    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed;
  }, [scheduledForLocal]);

  const scheduleIsPast = Boolean(scheduledDate && scheduledDate.getTime() <= Date.now());
  const missingConnectionPlatforms = useMemo(
    () => selectedPlatforms.filter((platform) => !connectionMap[platform]),
    [connectionMap, selectedPlatforms],
  );

  const queueDisabled =
    selectedPlatforms.length === 0 ||
    contentIsEmpty ||
    hasContentOverflow ||
    !scheduledDate ||
    scheduleIsPast ||
    isSubmitting ||
    isLoadingConnections ||
    missingConnectionPlatforms.length > 0;

  const queueBlockerMessage = useMemo(() => {
    if (isSubmitting) {
      return "Scheduling request in progress.";
    }

    if (isLoadingConnections) {
      return "Checking platform connection status.";
    }

    if (selectedPlatforms.length === 0) {
      return "Select at least one platform before queueing.";
    }

    if (missingConnectionPlatforms.length > 0) {
      return `Enter credentials for: ${missingConnectionPlatforms.join(", ")}.`;
    }

    if (contentIsEmpty) {
      return "Add post content before queueing.";
    }

    if (!scheduledDate) {
      return "Provide a valid schedule date and time.";
    }

    if (scheduleIsPast) {
      return "Schedule time must be in the future.";
    }

    if (hasContentOverflow) {
      return "Content exceeds at least one selected platform limit.";
    }

    return "";
  }, [
    contentIsEmpty,
    hasContentOverflow,
    isLoadingConnections,
    isSubmitting,
    missingConnectionPlatforms,
    scheduleIsPast,
    scheduledDate,
    selectedPlatforms.length,
  ]);

  const minRemaining = selectedPlatformCounters.reduce(
    (currentMinimum, counter) => Math.min(currentMinimum, counter.remaining),
    Number.POSITIVE_INFINITY,
  );

  function togglePlatform(platform: SocialPlatform) {
    setSelectedPlatforms((previous) => {
      if (previous.includes(platform)) {
        return previous.filter((item) => item !== platform);
      }

      return [...previous, platform];
    });
  }

  function updateMediaUrl(index: number, value: string) {
    setMediaUrls((previous) => previous.map((item, itemIndex) => (itemIndex === index ? value : item)));
  }

  function addMediaRow() {
    setMediaUrls((previous) => [...previous, ""]);
  }

  function removeMediaRow(index: number) {
    setMediaUrls((previous) => {
      if (previous.length === 1) {
        return previous;
      }

      return previous.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  async function handleSaveCredentials() {
    const platformUserId = credentialsUserId.trim();
    const accessToken = credentialsAccessToken.trim();

    if (!platformUserId || !accessToken) {
      setCredentialsFeedback({
        type: "error",
        message: "Platform user ID and access token are required.",
      });
      return;
    }

    setIsSavingCredentials(true);
    setCredentialsFeedback({
      type: "idle",
      message: "",
    });

    const payload: UpsertSocialIdentityApiRequest = {
      platform: credentialsPlatform,
      platformUserId,
      accessToken,
      refreshToken: credentialsRefreshToken.trim() || undefined,
      scopes: credentialsScopes
        .split(",")
        .map((scope) => scope.trim())
        .filter((scope) => scope.length > 0),
    };

    try {
      const response = await fetch("/api/social-identities", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      let responseBody: SocialIdentityMutationApiResponse | null = null;

      try {
        responseBody = (await response.json()) as SocialIdentityMutationApiResponse;
      } catch {
        responseBody = null;
      }

      if (!response.ok) {
        throw new Error(responseBody?.message ?? "Unable to save credentials right now.");
      }

      setCredentialsFeedback({
        type: "success",
        message: responseBody?.message ?? `${credentialsPlatform} credentials saved.`,
      });

      setCredentialsAccessToken("");
      setCredentialsRefreshToken("");
      setCredentialsScopes("");
      await loadConnectionStatus();
    } catch (error) {
      setCredentialsFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to save credentials right now.",
      });
    } finally {
      setIsSavingCredentials(false);
    }
  }

  async function handleQueuePost() {
    if (queueDisabled || !scheduledDate) {
      return;
    }

    setIsSubmitting(true);
    setSubmitFeedback({
      type: "idle",
      message: "",
    });

    const payload: SchedulePostApiRequest = {
      content: previewText,
      mediaUrls: cleanMediaUrls,
      targetPlatforms: selectedPlatforms,
      scheduledExecutionTime: scheduledDate.toISOString(),
    };

    try {
      const response = await fetch("/api/schedule-post", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      let responseBody: SchedulePostApiResponse | null = null;

      try {
        responseBody = (await response.json()) as SchedulePostApiResponse;
      } catch {
        responseBody = null;
      }

      if (!response.ok) {
        throw new Error(responseBody?.message ?? "Unable to queue post right now.");
      }

      const successMessage = responseBody?.queueJobId
        ? `Queued successfully. Post ID: ${responseBody.postId ?? "n/a"}, Job ID: ${responseBody.queueJobId}.`
        : responseBody?.message ?? "Post queued successfully.";

      setSubmitFeedback({
        type: "success",
        message: successMessage,
      });
    } catch (error) {
      setSubmitFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to queue post right now.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8 text-slate-900 sm:px-6 lg:px-10">
      <div className="page-noise pointer-events-none absolute inset-0 opacity-65" />
      <div className="pointer-events-none absolute -left-28 top-10 h-72 w-72 rounded-full bg-cyan-200/65 blur-3xl" />
      <div className="pointer-events-none absolute right-2 top-0 h-64 w-64 rounded-full bg-orange-200/60 blur-3xl" />

      <div className="relative mx-auto w-full max-w-7xl">
        <header className="animate-fade-up rounded-3xl border border-slate-300/70 bg-white/85 p-6 shadow-lg backdrop-blur sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex rounded-full border border-cyan-400 bg-cyan-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-900">
              Broadcast Board
            </span>
            <span className="inline-flex rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
              Single Tenant Command Center
            </span>
          </div>
          <h1 className="mt-4 text-3xl leading-tight text-slate-900 sm:text-5xl">Build the post once. Tune it per channel.</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700 sm:text-base">
            This unified workspace keeps message formatting, channel targeting, and scheduling in a single focused flow.
            Every control below updates your publishing readiness in real time.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white/75 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Character pressure</p>
              <p className={combineClassNames("mt-1 text-xl font-semibold", getCounterToneClassName(minRemaining))}>
                {selectedPlatformCounters.length > 0 ? `${minRemaining} min remaining` : "No platform selected"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/75 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Schedule status</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {!scheduledDate ? "Missing time" : scheduleIsPast ? "Time is in past" : "Ready"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/75 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Target channels</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{selectedPlatforms.length}</p>
            </div>
          </div>
        </header>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_1fr]">
          <section className="glass-panel animate-fade-up animate-delay-1 rounded-3xl p-6 sm:p-8">
            <div className="grid gap-7">
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-600">Campaign headline</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Launch day: 2 new AI automations"
                  className="rounded-xl border border-slate-300 bg-white/80 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
                />
              </label>

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-600">Post body</span>
                  <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                    {textLength} chars
                  </span>
                </div>
                <RichTextEditor onChange={setContentHtml} />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-600">Schedule slot</span>
                  <span
                    className={combineClassNames(
                      "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                      !scheduledDate
                        ? "bg-amber-100 text-amber-700"
                        : scheduleIsPast
                          ? "bg-rose-100 text-rose-700"
                          : "bg-emerald-100 text-emerald-700",
                    )}
                  >
                    {!scheduledDate ? "Required" : scheduleIsPast ? "Past" : "Ready"}
                  </span>
                </div>
                <input
                  type="datetime-local"
                  value={scheduledForLocal}
                  onChange={(event) => setScheduledForLocal(event.target.value)}
                  className="rounded-xl border border-slate-300 bg-white/80 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
                />
                <div className="grid gap-1 rounded-xl border border-slate-200 bg-white/70 p-3 text-xs text-slate-700">
                  <p>Local: {scheduledDate ? format(scheduledDate, "PPpp") : "Pick a valid date and time."}</p>
                  <p>UTC: {scheduledDate ? scheduledDate.toISOString() : "Pick a valid date and time."}</p>
                </div>
              </div>

              <div className="grid gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-600">Media attachment URLs</span>
                  <button
                    type="button"
                    onClick={addMediaRow}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 transition hover:border-cyan-400 hover:text-cyan-800"
                  >
                    Add URL
                  </button>
                </div>

                {mediaUrls.map((mediaUrl, index) => (
                  <div key={`media-row-${index}`} className="grid grid-cols-[1fr_auto] gap-2">
                    <input
                      value={mediaUrl}
                      onChange={(event) => updateMediaUrl(index, event.target.value)}
                      placeholder="https://example.com/asset.jpg"
                      className="rounded-xl border border-slate-300 bg-white/80 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
                    />
                    <button
                      type="button"
                      onClick={() => removeMediaRow(index)}
                      disabled={mediaUrls.length === 1}
                      className="rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 transition hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="grid content-start gap-6 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-auto">
            <section className="glass-panel animate-fade-up animate-delay-2 rounded-3xl p-6">
              <h2 className="text-2xl leading-tight text-slate-900">Account Connections</h2>
              <p className="mt-2 text-sm text-slate-600">
                Social posting is blocked until credentials are connected for selected platforms.
              </p>

              <div className="mt-4 grid gap-2">
                {platformOptions.map((platform) => {
                  const isConnected = connectionMap[platform.id];
                  const maskedHint = platformHintMap[platform.id];

                  return (
                    <div
                      key={`connection-${platform.id}`}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2"
                    >
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">{platform.label}</p>
                        <p className="text-[11px] text-slate-500">{maskedHint || "No credentials saved"}</p>
                      </div>
                      <span
                        className={combineClassNames(
                          "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                          isConnected ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700",
                        )}
                      >
                        {isConnected ? "Connected" : "Missing"}
                      </span>
                    </div>
                  );
                })}
              </div>

              {missingConnectionPlatforms.length > 0 && (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  Credentials required for: {missingConnectionPlatforms.join(", ")}.
                </p>
              )}

              <div className="mt-4 grid gap-3">
                <label className="grid gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">Platform</span>
                  <select
                    value={credentialsPlatform}
                    onChange={(event) => {
                      setCredentialsPlatform(event.target.value as SocialPlatform);
                    }}
                    className="rounded-xl border border-slate-300 bg-white/80 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
                  >
                    {platformOptions.map((platform) => (
                      <option key={`option-${platform.id}`} value={platform.id}>
                        {platform.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    {getPlatformUserIdLabel(credentialsPlatform)}
                  </span>
                  <input
                    type="text"
                    value={credentialsUserId}
                    onChange={(event) => setCredentialsUserId(event.target.value)}
                    placeholder="Enter your platform user ID"
                    className="rounded-xl border border-slate-300 bg-white/80 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    {getAccessTokenLabel(credentialsPlatform)}
                  </span>
                  <input
                    type="password"
                    value={credentialsAccessToken}
                    onChange={(event) => setCredentialsAccessToken(event.target.value)}
                    placeholder="Paste access token"
                    className="rounded-xl border border-slate-300 bg-white/80 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    Refresh token (optional)
                  </span>
                  <input
                    type="password"
                    value={credentialsRefreshToken}
                    onChange={(event) => setCredentialsRefreshToken(event.target.value)}
                    placeholder="Paste refresh token"
                    className="rounded-xl border border-slate-300 bg-white/80 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">Scopes (optional)</span>
                  <input
                    type="text"
                    value={credentialsScopes}
                    onChange={(event) => setCredentialsScopes(event.target.value)}
                    placeholder="tweet.read,tweet.write"
                    className="rounded-xl border border-slate-300 bg-white/80 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleSaveCredentials}
                  disabled={isSavingCredentials}
                  className="rounded-xl border border-cyan-800 bg-cyan-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-cyan-900 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300"
                >
                  {isSavingCredentials ? "Saving credentials..." : "Save Credentials"}
                </button>

                {credentialsFeedback.type !== "idle" && (
                  <p
                    className={combineClassNames(
                      "rounded-xl px-3 py-2 text-xs font-medium",
                      credentialsFeedback.type === "success"
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border border-rose-200 bg-rose-50 text-rose-700",
                    )}
                  >
                    {credentialsFeedback.message}
                  </p>
                )}
              </div>
            </section>

            <section className="glass-panel animate-fade-up animate-delay-3 rounded-3xl p-6">
              <h2 className="text-2xl leading-tight text-slate-900">Channel Fit Meter</h2>
              <p className="mt-2 text-sm text-slate-600">Toggle platforms and track remaining characters instantly.</p>

              <div className="mt-4 flex flex-wrap gap-3">
                {platformOptions.map((platform) => {
                  const selected = selectedPlatforms.includes(platform.id);

                  return (
                    <button
                      key={platform.id}
                      type="button"
                      onClick={() => togglePlatform(platform.id)}
                      className={combineClassNames(
                        "rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition",
                        selected
                          ? platform.accentClassName
                          : "border-slate-300 bg-white text-slate-700 hover:border-slate-500 hover:text-slate-900",
                      )}
                    >
                      {platform.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 grid gap-3">
                {selectedPlatformCounters.length === 0 ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                    Select at least one platform to see limit checks.
                  </p>
                ) : (
                  selectedPlatformCounters.map((counter) => {
                    const ratio = Math.min(100, (textLength / counter.characterLimit) * 100);

                    return (
                      <div key={`counter-${counter.id}`} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">{counter.label}</p>
                          <p className={combineClassNames("text-xs font-semibold", getCounterToneClassName(counter.remaining))}>
                            {counter.remaining >= 0 ? `${counter.remaining} left` : `${Math.abs(counter.remaining)} over`}
                          </p>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className={combineClassNames("h-full rounded-full transition-all", getCounterRailClassName(counter.remaining))}
                            style={{ width: `${ratio}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[11px] font-medium text-slate-500">
                          {textLength}/{counter.characterLimit}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className="glass-panel animate-fade-up animate-delay-3 rounded-3xl p-6">
              <h2 className="text-2xl leading-tight text-slate-900">Preview &amp; Actions</h2>
              <p className="mt-2 text-sm text-slate-600">Review the final message before queueing.</p>

              <div className="rich-preview mt-5 rounded-2xl p-4">
                <h3 className="text-xl text-slate-900">{title.trim().length > 0 ? title : "Untitled Post"}</h3>
                <div className="prose prose-sm mt-3 max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: contentHtml }} />
              </div>

              <dl className="mt-5 grid gap-2 text-sm text-slate-700">
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <dt className="font-medium">Platforms</dt>
                  <dd>{selectedPlatforms.length}</dd>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <dt className="font-medium">Media attachments</dt>
                  <dd>{cleanMediaUrls.length}</dd>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <dt className="font-medium">Character count</dt>
                  <dd>{textLength}</dd>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <dt className="font-medium">Scheduled UTC</dt>
                  <dd className="max-w-44 truncate text-right text-[11px]">
                    {scheduledDate ? scheduledDate.toISOString() : "Not set"}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 grid gap-3">
                <button
                  type="button"
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-cyan-400 hover:text-cyan-800"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  onClick={handleQueuePost}
                  disabled={queueDisabled}
                  className="rounded-xl border border-cyan-800 bg-cyan-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-cyan-900 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300"
                >
                  {isSubmitting ? "Queueing..." : "Queue Post"}
                </button>
                {queueDisabled && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                    {queueBlockerMessage}
                  </p>
                )}
                {submitFeedback.type !== "idle" && (
                  <p
                    className={combineClassNames(
                      "rounded-xl px-3 py-2 text-xs font-medium",
                      submitFeedback.type === "success"
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border border-rose-200 bg-rose-50 text-rose-700",
                    )}
                  >
                    {submitFeedback.message}
                  </p>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}