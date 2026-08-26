export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">
        Terms of Service
      </h1>
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
            1. Overview
          </h2>
          <p>
            Routemaster ("we," "our," "us") provides route optimization, client
            notification, and supply tracking software for mobile service
            professionals. By creating an account, you agree to these Terms of
            Service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            2. Accounts &amp; Trial
          </h2>
          <p>
            New accounts receive a 14-day free trial. No payment method is
            required to start a trial. After the trial ends, continued access
            requires an active paid subscription. You may cancel at any time
            from your account settings.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            3. Billing
          </h2>
          <p>
            Subscriptions are billed monthly or yearly in advance via Stripe.
            Fees are non-refundable except where required by law. You can cancel
            or change your plan at any time; access continues until the end of
            the current billing period.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            4. Acceptable Use
          </h2>
          <p>
            You agree to use Routemaster only for lawful business purposes. You
            are responsible for the accuracy of client data you enter and for
            obtaining any necessary consent before sending automated
            notifications to your clients.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Data</h2>
          <p>
            You own the data you enter into Routemaster (clients, jobs, routes,
            supplies). We store this data to provide the service. See our{" "}
            <a href="/privacy" className="text-blue-600 underline">
              Privacy Policy
            </a>{" "}
            for details on how data is handled.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            6. Service Availability
          </h2>
          <p>
            We aim for high availability but do not guarantee uninterrupted
            service. Routemaster relies on third-party services (mapping,
            payments, messaging) that are outside our direct control.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            7. Limitation of Liability
          </h2>
          <p>
            Routemaster is provided "as is." To the maximum extent permitted by
            law, we are not liable for indirect, incidental, or consequential
            damages arising from use of the service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            8. Changes
          </h2>
          <p>
            We may update these terms from time to time. Continued use of
            Routemaster after changes constitutes acceptance of the updated
            terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            9. Contact
          </h2>
          <p>
            Questions about these terms? Reach us at{" "}
            <a
              href="mailto:support@yourdomain.com"
              className="text-blue-600 underline"
            >
              support@vishall.kandharee@gmail.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
