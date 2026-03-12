import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Users, Briefcase, FileText, Receipt, Settings, Phone, MessageSquare,
  ArrowRight, CheckCircle2, ChevronRight, ExternalLink, BookOpen,
} from "lucide-react";

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      {children}
    </section>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
        {number}
      </div>
      <div className="flex-1 pb-6">
        <h4 className="font-semibold mb-1">{title}</h4>
        <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 text-sm text-blue-800 dark:text-blue-300">
      {children}
    </div>
  );
}

const NAV = [
  { id: "getting-started", label: "Getting Started" },
  { id: "customers", label: "Customers" },
  { id: "jobs", label: "Jobs" },
  { id: "quotes-invoices", label: "Quotes & Invoices" },
  { id: "call-recovery", label: "Call Recovery AI" },
  { id: "faq", label: "FAQ" },
];

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-primary">
            <BookOpen className="h-5 w-5" />
            TradeFlow Help Guide
          </div>
          <Link href="/">
            <Button variant="outline" size="sm">Back to App</Button>
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 flex gap-10">
        {/* Sidebar nav */}
        <aside className="hidden lg:block w-48 flex-shrink-0">
          <nav className="sticky top-24 space-y-1">
            {NAV.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-md hover:bg-muted transition-colors"
              >
                <ChevronRight className="h-3 w-3" />
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 space-y-14">

          {/* Intro */}
          <div>
            <h1 className="text-3xl font-bold mb-3">TradeFlow User Guide</h1>
            <p className="text-muted-foreground text-lg">
              Everything you need to know to get your service business running on TradeFlow — from creating your first customer to setting up the AI-powered missed-call recovery system.
            </p>
          </div>

          {/* Getting Started */}
          <Section id="getting-started">
            <h2 className="text-xl font-bold mb-6 pb-2 border-b">Getting Started</h2>
            <div className="space-y-0">
              <Step number={1} title="Create your account">
                Go to the login page and click <strong>Create account</strong>. Enter a username and password. Your username is private — only you see it.
              </Step>
              <Step number={2} title="Set up your organization">
                After logging in you'll be prompted to create your organization. Enter your business name, phone, email, and address. This information appears on quotes and invoices you send to customers.
              </Step>
              <Step number={3} title="Invite your team (paid plans)">
                Go to <strong>Settings → Organization</strong> and copy your invite code. Share it with team members. They create their own accounts and use the invite code to join your organization. You can set their role (admin, technician, or viewer) when creating the code.
              </Step>
              <Step number={4} title="Choose a plan">
                The free plan gives you up to 5 customers, jobs, quotes, and invoices. To remove those limits, go to <strong>Settings → Subscription</strong> and choose a paid plan. Plans start at $20/month.
              </Step>
            </div>
          </Section>

          {/* Customers */}
          <Section id="customers">
            <h2 className="text-xl font-bold mb-6 pb-2 border-b flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Customers
            </h2>
            <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
              <p>
                Customers are the foundation of TradeFlow. Every job, quote, and invoice is linked to a customer record.
              </p>
              <h3 className="font-semibold text-foreground text-base">Adding customers one at a time</h3>
              <p>Click <strong>Add Customer</strong> on the Customers page. Name is required; phone, email, address, and notes are optional but recommended for complete records.</p>

              <h3 className="font-semibold text-foreground text-base">Importing existing customers from a spreadsheet</h3>
              <ol className="space-y-2 list-none">
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" /> Click <strong>Import</strong> at the top of the Customers page.</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" /> Click <strong>Download Template</strong> to get a pre-formatted CSV file.</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" /> Open the file in Excel or Google Sheets. Fill in your customers — one per row. The Name column is required.</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" /> Save the file as CSV, then upload it in the import dialog.</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" /> Preview the data and click <strong>Import Customers</strong> to confirm.</li>
              </ol>
              <Note>
                <strong>Tip:</strong> If a row fails (e.g. missing name), it's skipped and reported after import. All valid rows are still imported.
              </Note>
            </div>
          </Section>

          {/* Jobs */}
          <Section id="jobs">
            <h2 className="text-xl font-bold mb-6 pb-2 border-b flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" /> Jobs
            </h2>
            <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
              <p>Jobs track the work you do for customers from first contact to payment.</p>
              <h3 className="font-semibold text-foreground text-base">Job statuses</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { status: "Lead", desc: "Initial inquiry, not yet quoted" },
                  { status: "Quoted", desc: "A quote has been sent" },
                  { status: "Scheduled", desc: "Work has been booked" },
                  { status: "In Progress", desc: "Work is underway" },
                  { status: "Done", desc: "Work completed, not yet invoiced" },
                  { status: "Invoiced", desc: "Invoice sent, awaiting payment" },
                  { status: "Paid", desc: "Payment received" },
                  { status: "Canceled", desc: "Job was canceled" },
                ].map((s) => (
                  <div key={s.status} className="flex gap-2 p-2 rounded border bg-muted/30">
                    <ArrowRight className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <div><span className="font-medium text-foreground">{s.status}</span> — {s.desc}</div>
                  </div>
                ))}
              </div>
              <p>Move a job through statuses by opening it and selecting a new status from the dropdown. Each status change is logged in the job timeline.</p>
            </div>
          </Section>

          {/* Quotes & Invoices */}
          <Section id="quotes-invoices">
            <h2 className="text-xl font-bold mb-6 pb-2 border-b flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Quotes & Invoices
            </h2>
            <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
              <div>
                <h3 className="font-semibold text-foreground text-base mb-2">Quotes</h3>
                <p>Create a quote from <strong>Quotes → New Quote</strong> or directly from a job. Add line items, set quantities and rates, and apply a tax rate and discount if needed. Once sent, a quote can be accepted or rejected.</p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-base mb-2">Invoices</h3>
                <p>Create an invoice from <strong>Invoices → New Invoice</strong> or convert an accepted quote directly to an invoice. Mark invoices as paid once payment is received. Invoice totals feed into your dashboard revenue numbers.</p>
              </div>
              <Note>
                <strong>Totals are calculated automatically.</strong> Subtotal = sum of (quantity × unit price). Tax is applied to the subtotal after any discount.
              </Note>
            </div>
          </Section>

          {/* Call Recovery AI */}
          <Section id="call-recovery">
            <h2 className="text-xl font-bold mb-6 pb-2 border-b flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" /> Call Recovery AI Setup
            </h2>
            <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
              <p>
                Call Recovery AI automatically texts customers back when they call your business and nobody answers.
                The AI collects the caller's name, location, and what service they need — so you never lose a lead.
              </p>

              <Note>
                Call Recovery AI is an add-on subscription ($29–$149/month). You must be on a paid TradeFlow plan to activate it. Go to <strong>Call Recovery</strong> in the sidebar to subscribe.
              </Note>

              <h3 className="font-semibold text-foreground text-base mt-4">What you'll need</h3>
              <ul className="space-y-1 list-disc list-inside">
                <li>A free Twilio account (takes ~5 minutes to set up)</li>
                <li>A Twilio phone number (~$1/month for a local number)</li>
                <li>Access to your business phone's call-forwarding settings</li>
              </ul>

              <h3 className="font-semibold text-foreground text-base mt-4">Step-by-step setup</h3>
              <div className="space-y-0">
                <Step number={1} title="Create a Twilio account">
                  Go to <a href="https://www.twilio.com/try-twilio" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">twilio.com <ExternalLink className="h-3 w-3" /></a> and sign up for a free account. You'll need to verify your email and phone number. Twilio gives you a small free credit to get started.
                </Step>
                <Step number={2} title="Buy a phone number">
                  In the Twilio Console, go to <strong>Phone Numbers → Manage → Buy a Number</strong>. Search for a local number in your area code. Local numbers cost about $1/month. Click <strong>Buy</strong> to purchase it.
                </Step>
                <Step number={3} title="Configure the voice webhook">
                  In the Twilio Console, click on your new number. Under <strong>Voice Configuration</strong>:
                  <ul className="mt-2 space-y-1 list-disc list-inside ml-2">
                    <li>Set <strong>Configure with</strong> to "Webhook, TwiML Bin, Function, Studio Flow, Proxy Service"</li>
                    <li>Set <strong>A call comes in</strong> to Webhook</li>
                    <li>Paste your <strong>Missed-call webhook URL</strong> (found on the Setup tab in Call Recovery)</li>
                    <li>Set the HTTP method to <strong>HTTP POST</strong></li>
                  </ul>
                </Step>
                <Step number={4} title="Configure the SMS webhook">
                  Still on the same number page, scroll to <strong>Messaging Configuration</strong>:
                  <ul className="mt-2 space-y-1 list-disc list-inside ml-2">
                    <li>Set <strong>A message comes in</strong> to Webhook</li>
                    <li>Paste your <strong>SMS reply webhook URL</strong> (found on the Setup tab in Call Recovery)</li>
                    <li>Set the HTTP method to <strong>HTTP POST</strong></li>
                  </ul>
                </Step>
                <Step number={5} title="Enter the number in TradeFlow">
                  In TradeFlow, go to <strong>Call Recovery → Setup</strong>. Enter your Twilio phone number (include the country code, e.g. +19105551234) and click Save.
                </Step>
                <Step number={6} title="Set up call forwarding on your business phone">
                  This step is done on your actual business phone or phone system — not in TradeFlow or Twilio.
                  <div className="mt-2 space-y-2">
                    <p><strong>On an iPhone:</strong> Go to Settings → Phone → Call Forwarding. Enable it and enter your Twilio number. <em>Note: This forwards ALL calls, not just missed ones — only use this method if you're comfortable with that.</em></p>
                    <p><strong>On Android:</strong> Open the Phone app → Settings → Supplemental services → Forward when unreachable. Enter your Twilio number.</p>
                    <p><strong>On a VoIP/business system (RingCentral, Google Voice, etc.):</strong> Look for "Forward when unanswered" or "No-answer call forwarding" in your phone system settings and set it to your Twilio number.</p>
                    <p><strong>Most carrier plans also support:</strong> Dialing <code className="bg-muted px-1 rounded">*71 + your Twilio number</code> to enable "forward when busy/no answer" — check with your carrier for the exact code.</p>
                  </div>
                </Step>
                <Step number={7} title="Test it">
                  Call your business number from another phone and let it go unanswered. After a few rings, the call should forward to Twilio. You'll hear a brief voice message, and within a few seconds the calling number will receive an SMS from the AI. Reply to that SMS to test the conversation.
                </Step>
              </div>

              <h3 className="font-semibold text-foreground text-base mt-4">Toll-free vs. local numbers</h3>
              <p>
                You can use either a local (10-digit) number or a toll-free (888/800/etc.) number. Local numbers are cheaper ($1/month) and often have better SMS delivery rates for A2P messaging. Toll-free numbers require a separate verification process with Twilio before SMS delivery is fully enabled.
              </p>

              <h3 className="font-semibold text-foreground text-base mt-4">Viewing recovered leads</h3>
              <p>
                Go to <strong>Call Recovery → Missed Calls</strong> to see all incoming calls, the AI conversation, and whether the lead was successfully captured. Recovered leads show the caller's name, requested service type, location, and urgency.
              </p>
            </div>
          </Section>

          {/* FAQ */}
          <Section id="faq">
            <h2 className="text-xl font-bold mb-6 pb-2 border-b">Frequently Asked Questions</h2>
            <div className="space-y-6">
              {[
                {
                  q: "Can I use TradeFlow on my phone?",
                  a: "Yes. TradeFlow is a Progressive Web App (PWA). On iPhone, open it in Safari and tap Share → Add to Home Screen. On Android, open it in Chrome and tap the install prompt. It works like a native app once installed.",
                },
                {
                  q: "Do my customers need to download anything?",
                  a: "No. Customers receive SMS text messages from the AI. They don't need to install any app or visit any website.",
                },
                {
                  q: "What happens if a customer texts STOP?",
                  a: "The AI immediately opts them out and will not send any further messages. This is handled automatically in compliance with carrier regulations.",
                },
                {
                  q: "Will the AI book appointments for me?",
                  a: "The AI collects the lead information (name, service needed, location, urgency) and creates a missed-call record in your dashboard. You then follow up directly to schedule the job.",
                },
                {
                  q: "Can multiple team members see the same customers and jobs?",
                  a: "Yes. Everyone in your organization shares the same data. Role permissions control what each person can view or edit.",
                },
                {
                  q: "What does the free plan include?",
                  a: "Up to 5 customers, 5 jobs, 5 quotes, and 5 invoices. The Call Recovery AI add-on requires a paid TradeFlow subscription.",
                },
                {
                  q: "Can I cancel anytime?",
                  a: "Yes. Go to Settings → Subscription and click Manage Billing to cancel or change your plan. Your data is retained after cancellation.",
                },
                {
                  q: "Why is Twilio showing a toll-free verification is in progress?",
                  a: "Twilio requires carriers to verify toll-free numbers before they can send A2P SMS at full volume. This is a Twilio process that typically takes 5–7 business days. During verification, SMS delivery may be limited. Using a local 10-digit number avoids this delay.",
                },
              ].map((item) => (
                <div key={item.q} className="border-b pb-5">
                  <h3 className="font-semibold mb-1.5 flex items-start gap-2">
                    <MessageSquare className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    {item.q}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed pl-6">{item.a}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* Footer */}
          <div className="pt-6 border-t text-center text-sm text-muted-foreground">
            <p>Need more help? Contact your TradeFlow administrator.</p>
            <div className="flex justify-center gap-4 mt-2">
              <a href="/privacy" className="hover:underline">Privacy Policy</a>
              <a href="/sms-consent" className="hover:underline">SMS Consent Policy</a>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
