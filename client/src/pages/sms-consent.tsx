export default function SmsConsentPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2" data-testid="text-sms-consent-title">
          SMS Messaging — Consent &amp; Program Description
        </h1>
        <p className="text-muted-foreground mb-8">Last updated: March 12, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Program Description</h2>
            <p>
              TradeFlow operates a <strong>Contractor Call-Capture &amp; Job Recovery</strong> SMS service on behalf of
              its business subscribers (contractors, electricians, plumbers, HVAC companies, and similar blue-collar
              service businesses). When a consumer calls a participating business and that call goes unanswered, the
              TradeFlow system automatically sends a single SMS text message to the caller's mobile number on the
              business's behalf. The message introduces the business by name and invites the caller to describe the
              service they need so the business can follow up promptly.
            </p>
            <p className="mt-3">
              If the consumer replies, the system engages in a short automated text conversation (powered by AI) to
              collect basic job details — such as the type of service needed, preferred location, and urgency — and
              then creates a lead record in the business's TradeFlow account so a human representative can follow up.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. How Opt-In Works</h2>
            <p>
              Consumers provide <strong>implied consent</strong> to receive an automated SMS callback by placing a
              telephone call to a business that uses the TradeFlow Call Recovery service. By initiating a call to the
              business's phone number, the caller acknowledges they are seeking contact with the business and agrees
              that, if their call goes unanswered, they may receive an automated text message follow-up from that
              business via the TradeFlow platform.
            </p>
            <p className="mt-3">
              No prior registration or web form is required. The sole trigger for receiving a message is the
              consumer's own outbound call to the business's number.
            </p>
            <div className="mt-4 p-4 bg-muted rounded-lg border">
              <p className="font-semibold text-foreground mb-1">Call-to-Action Language (example disclosed at point of contact):</p>
              <p className="italic text-muted-foreground">
                "You've reached [Business Name]. We missed your call, but we don't want to miss your business! Reply
                to this text to tell us what you need and we'll get back to you as soon as possible. Reply STOP to
                opt out."
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Message Types</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Initial outreach message:</strong> A single automated SMS sent immediately after a missed call,
                introducing the business and inviting the caller to describe their service need.
              </li>
              <li>
                <strong>Conversational follow-up messages:</strong> Additional automated SMS replies generated in
                response to the consumer's own inbound texts. These messages collect job details (service type,
                location, urgency) to create a lead record. The conversation ends automatically once sufficient
                information is collected or the consumer stops responding.
              </li>
            </ul>
            <p className="mt-3">
              Message content is <strong>transactional and service-oriented</strong>. Messages do not contain
              promotional offers, coupons, or marketing material beyond identifying the business and the purpose of
              the outreach.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Message Frequency</h2>
            <p>
              Consumers receive <strong>1 initial message</strong> per missed call event. Additional messages are only
              sent in direct response to the consumer's own replies. Typical conversations span 2–5 messages total.
              Once the conversation is complete or the consumer opts out, no further messages are sent for that
              contact unless a new missed call event occurs.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. How to Opt Out</h2>
            <p>
              Consumers can opt out at any time by replying <strong>STOP</strong> to any message received. Upon
              receipt of a STOP reply, no further messages will be sent to that mobile number from the sending
              business's Twilio number. Standard opt-out keywords are supported: <strong>STOP, STOPALL, UNSUBSCRIBE,
              CANCEL, END, QUIT</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. How to Get Help</h2>
            <p>
              Consumers who reply <strong>HELP</strong> will receive a message with the business name, a brief
              description of the service, and instructions for opting out. For additional support, consumers may
              contact TradeFlow at the address provided in our{" "}
              <a href="/privacy" className="text-primary underline underline-offset-2">Privacy Policy</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Message &amp; Data Rates</h2>
            <p>
              Standard message and data rates may apply depending on the consumer's mobile carrier plan. TradeFlow
              does not charge consumers for receiving messages. The business subscriber is responsible for any
              Twilio messaging costs associated with sending messages on their behalf.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Supported Carriers</h2>
            <p>
              Messages are delivered via Twilio's carrier network and are supported on all major U.S. carriers
              including AT&amp;T, Verizon, T-Mobile, and regional carriers. Carrier support for short code and
              long-code SMS is subject to carrier-specific policies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Privacy &amp; Data Use</h2>
            <p>
              Phone numbers and conversation content collected through this service are used solely to:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Facilitate the automated SMS callback on behalf of the business</li>
              <li>Create a lead record in the business's TradeFlow account</li>
              <li>Improve the accuracy of the AI conversation engine</li>
            </ul>
            <p className="mt-3">
              Consumer phone numbers and message content are <strong>not sold, shared, or used for
              third-party marketing purposes</strong>. Data is retained only as long as necessary to fulfill the
              service and comply with applicable law. For full details, see our{" "}
              <a href="/privacy" className="text-primary underline underline-offset-2">Privacy Policy</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Business Subscriber Responsibilities</h2>
            <p>
              Businesses that subscribe to the TradeFlow Call Recovery add-on agree to:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Only use the service for legitimate business follow-up with individuals who called their registered business number</li>
              <li>Ensure their business phone number is properly registered and compliant with applicable telecommunications regulations</li>
              <li>Not use the service to contact individuals who have not called their business number</li>
              <li>Comply with the Telephone Consumer Protection Act (TCPA), CAN-SPAM Act, and any applicable state or local communications laws</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Contact</h2>
            <p>
              Questions about this SMS program can be directed to TradeFlow support. For privacy-related requests,
              please refer to our{" "}
              <a href="/privacy" className="text-primary underline underline-offset-2">Privacy Policy</a>.
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
