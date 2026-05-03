import { Link } from "wouter";
import tradeflowLogo from "@assets/tradeflow512_1773073035241.png";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <img src={tradeflowLogo} alt="TradeFlowKit" className="h-7 w-7 rounded object-contain" />
            <span className="font-bold text-base tracking-tight">TradeFlow</span>
          </Link>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            ← Back to home
          </Link>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
        <h1 className="text-4xl font-extrabold mb-2">Terms of Service</h1>
        <p className="text-gray-500 text-sm mb-10">Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

        <div className="prose prose-gray max-w-none space-y-8 text-sm leading-relaxed text-gray-700">

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using TradeFlowKit ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the Service. TradeFlowKit is operated by Shotgun Ninjas Productions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">2. Description of Service</h2>
            <p>
              TradeFlowKit is a business operations platform for trade contractors that provides tools for job tracking, customer management, quoting, invoicing, team management, and related features. The Service is provided on a subscription basis with both free and paid tiers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">3. Accounts and Registration</h2>
            <p>
              You must create an account to use the Service. You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You must provide accurate and complete information when registering. You may not share your account with others or use another person's account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">4. Subscription and Payment</h2>
            <p>
              Paid subscriptions are billed monthly. Subscription fees are non-refundable except as required by law. We reserve the right to change pricing at any time with 30 days notice. Failure to pay may result in suspension or termination of your account. Payment processing is handled by Stripe — by subscribing you also agree to Stripe's terms of service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">5. Acceptable Use</h2>
            <p>You agree not to use the Service to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Violate any applicable laws or regulations</li>
              <li>Send unsolicited communications (spam)</li>
              <li>Impersonate any person or entity</li>
              <li>Transmit harmful, offensive, or illegal content</li>
              <li>Attempt to gain unauthorized access to any part of the Service</li>
              <li>Use the Service to compete with or reverse-engineer the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">6. Data and Privacy</h2>
            <p>
              Your use of the Service is also governed by our <Link href="/privacy" className="text-red-600 hover:underline">Privacy Policy</Link>, which is incorporated into these Terms. You retain ownership of the data you upload to the Service. You grant us a limited license to store and process your data to provide the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">7. SMS Communications</h2>
            <p>
              Certain features of the Service involve sending SMS messages to your customers on your behalf using Twilio. You are responsible for ensuring you have appropriate consent from your customers to receive such messages. You must comply with all applicable laws regarding SMS communications, including the Telephone Consumer Protection Act (TCPA). Customers can opt out at any time by replying STOP.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">8. Stripe Connect and Payments</h2>
            <p>
              If you use the online invoice payment feature, you connect your own Stripe account to process payments from your customers. You agree to Stripe's Connected Account Agreement. TradeFlowKit acts as a platform intermediary only — we do not hold, process, or transfer your customer funds.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">9. Intellectual Property</h2>
            <p>
              The Service and its original content, features, and functionality are owned by Shotgun Ninjas Productions and are protected by copyright, trademark, and other intellectual property laws. You may not copy, modify, distribute, or create derivative works based on the Service without our express written permission.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">10. Termination</h2>
            <p>
              We may suspend or terminate your access to the Service at any time for violation of these Terms or for any other reason with reasonable notice. You may cancel your subscription at any time from the billing settings. Upon termination, your right to use the Service ceases immediately.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">11. Disclaimers and Limitation of Liability</h2>
            <p>
              The Service is provided "as is" without warranties of any kind. We do not warrant that the Service will be uninterrupted, error-free, or secure. To the fullest extent permitted by law, Shotgun Ninjas Productions shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">12. Changes to Terms</h2>
            <p>
              We may update these Terms from time to time. We will notify you of significant changes by email or through the Service. Continued use of the Service after changes take effect constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">13. Contact</h2>
            <p>
              Questions about these Terms? Contact us at{" "}
              <a href="mailto:support@tradeflowkit.com" className="text-red-600 hover:underline">
                support@tradeflowkit.com
              </a>
              {" "}or visit{" "}
              <a href="https://shotgunninjas.com" target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline">
                shotgunninjas.com
              </a>.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-gray-100 py-8 mt-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <span>© {new Date().getFullYear()} TradeFlowKit — Shotgun Ninjas Productions</span>
          <div className="flex gap-5">
            <Link href="/privacy" className="hover:text-gray-600 transition-colors">Privacy Policy</Link>
            <Link href="/" className="hover:text-gray-600 transition-colors">Home</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
