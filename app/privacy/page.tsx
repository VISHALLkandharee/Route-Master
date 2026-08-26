export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-400 mb-10">
        Last updated:{" "}
        {new Date().toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </p>

      <div className="prose prose-sm max-w-none space-y-6 text-gray-700">
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            1. What We Collect
          </h2>
          <p>
            When you use Routemaster, we collect: your account information
            (name, email, business details), the client and job data you enter,
            and basic usage information needed to operate the service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            2. How We Use It
          </h2>
          <p>
            We use your data solely to provide the Routemaster service —
            calculating routes, generating client notifications, tracking
            supplies, and processing billing. We do not sell your data.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            3. Third-Party Services
          </h2>
          <p>We use trusted third-party providers to operate Routemaster:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Supabase</strong> — database and authentication
            </li>
            <li>
              <strong>Stripe</strong> — payment processing (we never see your
              full card details)
            </li>
            <li>
              <strong>OpenRouteService</strong> — route calculation and
              geocoding of addresses
            </li>
            <li>
              <strong>Anthropic</strong> — generating client notification
              message text
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            4. Data Retention &amp; Deletion
          </h2>
          <p>
            Your data is retained as long as your account is active. You can
            permanently delete your account and all associated data at any time
            from Settings → Danger Zone.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            5. Security
          </h2>
          <p>
            We use industry-standard security practices including row-level
            database security, encrypted connections, and secure authentication
            to protect your data.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            6. Your Client Data
          </h2>
          <p>
            You are responsible for having appropriate permission to store and
            message your own clients through Routemaster. We act only as a data
            processor for the client information you enter.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            7. Contact
          </h2>
          <p>
            Questions about your data? Reach us at{" "}
            <a
              href="mailto:support@yourdomain.com"
              className="text-blue-600 underline"
            >
              support@yourdomain.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
