import { useState } from "react";
import { submitRemoval } from "../lib/api";

type Status = "idle" | "submitting" | "success" | "error";

export default function RemovePage() {
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const canSubmit = url.length > 0 && email.length > 0 && status !== "submitting";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");
    try {
      await submitRemoval({ url, email, reason });
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (status === "success") {
    return (
      <div className="max-w-lg mx-auto p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Request Submitted</h1>
        <p className="text-gray-600">
          Your removal request has been submitted. We&apos;ll review it shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Request Recipe Removal</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="remove-url" className="block text-sm font-medium mb-1">
            Recipe URL
          </label>
          <input
            id="remove-url"
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/my-recipe"
            className="w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div>
          <label htmlFor="remove-email" className="block text-sm font-medium mb-1">
            Your Email
          </label>
          <input
            id="remove-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div>
          <label htmlFor="remove-reason" className="block text-sm font-medium mb-1">
            Reason (optional)
          </label>
          <textarea
            id="remove-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="Why should this recipe be removed?"
            className="w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        {status === "error" && (
          <p className="text-red-600 text-sm">{errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "submitting" ? "Submitting…" : "Submit Removal Request"}
        </button>
      </form>
    </div>
  );
}
