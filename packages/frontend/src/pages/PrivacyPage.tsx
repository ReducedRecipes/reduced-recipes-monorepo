export default function PrivacyPage() {
  return (
    <main className="px-6 py-20 mx-auto" style={{ maxWidth: 900 }}>
      <div className="caps text-accent-ink mb-4">◆ Privacy Policy</div>
      <h1
        className="serif font-normal italic mb-10"
        style={{
          fontSize: "clamp(48px, 6vw, 84px)",
          lineHeight: 0.95,
          letterSpacing: "-0.02em",
        }}
      >
        Your data, kept simple.
      </h1>

      <div
        className="flex flex-col gap-8 text-ink-2"
        style={{ fontSize: 18, lineHeight: 1.6, maxWidth: 640 }}
      >
        <p className="caps text-ink-3" style={{ fontSize: 13 }}>
          Last updated: April 23, 2026
        </p>

        {/* ——— Who we are ——— */}
        <section>
          <h2
            className="serif font-normal italic mb-4"
            style={{ fontSize: 28, lineHeight: 1.1 }}
          >
            Who we are
          </h2>
          <p>
            Reduced Recipes ("we", "us", "our") operates the website at{" "}
            <a
              href="https://reducedrecipes.com"
              className="underline"
              style={{ color: "var(--accent-ink)" }}
            >
              reducedrecipes.com
            </a>{" "}
            and the Reduced Recipes mobile application. This policy covers both.
          </p>
        </section>

        {/* ——— What we collect ——— */}
        <section>
          <h2
            className="serif font-normal italic mb-4"
            style={{ fontSize: 28, lineHeight: 1.1 }}
          >
            What we collect
          </h2>
          <ul className="list-none flex flex-col gap-3 mono" style={{ fontSize: 14 }}>
            <li>→ <strong>Account information</strong> — email address and display name when you sign up</li>
            <li>→ <strong>Saved content</strong> — recipes you save, collections you create, and shopping lists</li>
            <li>→ <strong>Usage data</strong> — pages visited, searches performed, and app interactions</li>
            <li>→ <strong>Device information</strong> — device type, operating system, and browser for improving compatibility</li>
          </ul>
        </section>

        {/* ——— What we don't collect ——— */}
        <section>
          <h2
            className="serif font-normal italic mb-4"
            style={{ fontSize: 28, lineHeight: 1.1 }}
          >
            What we don't collect
          </h2>
          <ul className="list-none flex flex-col gap-3 mono" style={{ fontSize: 14 }}>
            <li>→ We don't sell your data to anyone</li>
            <li>→ We don't track you across other websites</li>
            <li>→ We don't store payment information directly — all payments are handled by third-party processors</li>
          </ul>
        </section>

        {/* ——— How we use it ——— */}
        <section>
          <h2
            className="serif font-normal italic mb-4"
            style={{ fontSize: 28, lineHeight: 1.1 }}
          >
            How we use your data
          </h2>
          <p className="mb-3">We use collected information to:</p>
          <ul className="list-none flex flex-col gap-3 mono" style={{ fontSize: 14 }}>
            <li>→ Provide and maintain the service</li>
            <li>→ Sync your saved recipes, collections, and shopping lists across devices</li>
            <li>→ Send notifications you've opted into (e.g., new recipes from saved sites)</li>
            <li>→ Improve the app and fix bugs</li>
          </ul>
        </section>

        {/* ——— Third-party services ——— */}
        <section>
          <h2
            className="serif font-normal italic mb-4"
            style={{ fontSize: 28, lineHeight: 1.1 }}
          >
            Third-party services
          </h2>
          <p>We use the following services that may process your data:</p>
          <ul className="list-none flex flex-col gap-3 mono mt-3" style={{ fontSize: 14 }}>
            <li>→ <strong>Firebase</strong> — analytics and crash reporting</li>
            <li>→ <strong>Expo</strong> — push notifications and app updates</li>
          </ul>
          <p className="mt-3">
            Each operates under their own privacy policy. We recommend reviewing
            them if you'd like the full picture.
          </p>
        </section>

        {/* ——— Data retention ——— */}
        <section>
          <h2
            className="serif font-normal italic mb-4"
            style={{ fontSize: 28, lineHeight: 1.1 }}
          >
            Data retention
          </h2>
          <p>
            We keep your data for as long as your account is active. If you
            delete your account, we remove your personal data within 30 days.
            Anonymised, aggregated data (e.g., total searches performed) may be
            retained indefinitely.
          </p>
        </section>

        {/* ——— Your rights ——— */}
        <section>
          <h2
            className="serif font-normal italic mb-4"
            style={{ fontSize: 28, lineHeight: 1.1 }}
          >
            Your rights
          </h2>
          <p className="mb-3">You can:</p>
          <ul className="list-none flex flex-col gap-3 mono" style={{ fontSize: 14 }}>
            <li>→ Access or export your data at any time from your settings</li>
            <li>→ Delete your account and all associated data</li>
            <li>→ Opt out of non-essential notifications</li>
            <li>→ Request a copy of all data we hold about you</li>
          </ul>
        </section>

        {/* ——— Children ——— */}
        <section>
          <h2
            className="serif font-normal italic mb-4"
            style={{ fontSize: 28, lineHeight: 1.1 }}
          >
            Children's privacy
          </h2>
          <p>
            Our service is not directed at children under 13. We do not knowingly
            collect personal information from children. If you believe we have
            collected data from a child, please contact us and we will remove it
            promptly.
          </p>
        </section>

        {/* ——— Changes ——— */}
        <section>
          <h2
            className="serif font-normal italic mb-4"
            style={{ fontSize: 28, lineHeight: 1.1 }}
          >
            Changes to this policy
          </h2>
          <p>
            We may update this policy from time to time. If we make significant
            changes, we'll notify you through the app or by email. The "last
            updated" date at the top reflects the most recent revision.
          </p>
        </section>

        {/* ——— Contact ——— */}
        <section>
          <h2
            className="serif font-normal italic mb-4"
            style={{ fontSize: 28, lineHeight: 1.1 }}
          >
            Contact
          </h2>
          <p>
            Questions about this policy? Reach us at{" "}
            <a
              href="mailto:privacy@reducedrecipes.com"
              className="underline"
              style={{ color: "var(--accent-ink)" }}
            >
              privacy@reducedrecipes.com
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
