import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { AuthModal } from "@/components/landing/auth-modal";
import tradeflowLogo from "@assets/tradeflow512_1773073035241.png";
import {
  Zap,
  FileText,
  Users,
  Phone,
  Smartphone,
  BarChart3,
  CheckCircle2,
  Star,
  ArrowRight,
  Wrench,
  CreditCard,
  Bell,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { EcosystemSection } from "@/components/ecosystem-section";

const features = [
  {
    icon: Wrench,
    title: "Job Tracking",
    desc: "Track every job from lead to paid. Kanban board and list view keep your team aligned.",
  },
  {
    icon: FileText,
    title: "Quotes & Invoices",
    desc: "Create professional quotes and invoices in seconds. Send via link, collect payment online.",
  },
  {
    icon: Users,
    title: "Customer History",
    desc: "Full history of every customer — jobs, quotes, invoices, and notes in one place.",
  },
  {
    icon: Zap,
    title: "Team Management",
    desc: "Invite techs, assign jobs, control access. Roles for every team member.",
  },
  {
    icon: Phone,
    title: "Call Recovery AI",
    desc: "Never lose a missed call. AI texts back instantly and captures new jobs for you.",
  },
  {
    icon: CreditCard,
    title: "Online Payments",
    desc: "Customers pay invoices by card from their phone. Money goes straight to your account.",
  },
  {
    icon: Bell,
    title: "Auto Reminders",
    desc: "Overdue invoices and pending quotes automatically followed up by SMS. Zero manual chasing.",
  },
  {
    icon: RefreshCw,
    title: "Recurring Jobs",
    desc: "Set a schedule once. TradeFlow auto-creates the next job when you close the current one.",
  },
  {
    icon: Smartphone,
    title: "Mobile-First PWA",
    desc: "Works on your phone like a native app. Install from your browser — no app store needed.",
  },
];

const steps = [
  {
    num: "1",
    title: "Capture every lead",
    desc: "Missed calls, new texts, walk-ins — TradeFlow captures the lead and kicks off the workflow.",
    color: "bg-orange-600",
  },
  {
    num: "2",
    title: "Quote & win jobs",
    desc: "Send a professional quote in 60 seconds. Customers approve directly on their phone.",
    color: "bg-amber-600",
  },
  {
    num: "3",
    title: "Invoice & get paid",
    desc: "Invoice on completion. Customers pay online by card. Know exactly what you're owed.",
    color: "bg-amber-600",
  },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "/mo",
    desc: "Get started with the basics",
    features: ["5 customers", "5 jobs", "Quotes & invoices", "1 team member"],
    cta: "Get Started Free",
    tab: "register" as const,
    highlighted: false,
  },
  {
    name: "Individual",
    price: "$20",
    period: "/mo",
    desc: "For solo tradespeople",
    features: ["Unlimited customers", "Unlimited jobs", "Unlimited quotes & invoices", "Online invoice payments", "Auto SMS reminders"],
    cta: "Start Free Trial",
    tab: "register" as const,
    highlighted: false,
  },
  {
    name: "Small Business",
    price: "$100",
    period: "/mo",
    desc: "For growing crews",
    features: ["Everything in Individual", "Up to 25 team members", "Recurring jobs", "Team workload view", "Priority support"],
    cta: "Start Free Trial",
    tab: "register" as const,
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "$200",
    period: "/mo",
    desc: "For large operations",
    features: ["Everything in Small Business", "Unlimited team members", "Dedicated support", "Custom onboarding"],
    cta: "Contact Sales",
    tab: "register" as const,
    highlighted: false,
  },
];

const testimonials = [
  {
    quote: "I used to lose at least 3 jobs a week to missed calls. TradeFlow's call recovery AI texts customers back and books them — I just show up.",
    name: "Mike R.",
    trade: "Electrician · Austin, TX",
    stars: 5,
  },
  {
    quote: "Sending quotes used to take me 30 minutes each. Now it's 2 minutes from the job site. Customers love how professional it looks.",
    name: "Sarah L.",
    trade: "Plumber · Denver, CO",
    stars: 5,
  },
  {
    quote: "Finally a tool built for the trades. No bloat, no learning curve. My whole crew was up and running the same day.",
    name: "Carlos M.",
    trade: "HVAC Contractor · Phoenix, AZ",
    stars: 5,
  },
];

const useCases = [
  { trade: "Electricians", desc: "Panel upgrades, service calls, commercial bids" },
  { trade: "Plumbers", desc: "Emergency calls, remodel quotes, recurring maintenance" },
  { trade: "HVAC", desc: "Seasonal tune-ups, installs, service contracts" },
  { trade: "Carpenters", desc: "Project quotes, material tracking, client history" },
  { trade: "Landscapers", desc: "Weekly routes, seasonal bids, crew scheduling" },
  { trade: "General Contractors", desc: "Multi-trade jobs, subcontractor coordination, billing" },
];

const faqs = [
  {
    q: "Do I need a credit card to start?",
    a: "No. The Free plan is genuinely free — no credit card required. Upgrade when you're ready.",
  },
  {
    q: "How does online invoice payment work?",
    a: "Connect your Stripe account in Settings. Your customers get a Pay Now link on their invoice and pay by card. Money goes directly to your bank — TradeFlow never holds your funds.",
  },
  {
    q: "Can my whole crew use it?",
    a: "Yes. Small Business plans support up to 25 team members. Enterprise supports unlimited. Each tech gets their own login and role.",
  },
  {
    q: "Does it work on my phone?",
    a: "TradeFlow is built mobile-first. Install it from your browser like an app — no app store download needed. Works even when signal is spotty.",
  },
  {
    q: "What happens when I hit the free plan limit?",
    a: "You'll see a prompt to upgrade. Your existing data is never deleted — just upgrade and keep going.",
  },
  {
    q: "Can I import my existing customers?",
    a: "Yes. Upload a CSV and map your columns. Your customer list will be imported in seconds.",
  },
];

export default function AuthPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<"login" | "register">("login");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  function openModal(tab: "login" | "register") {
    setModalTab(tab);
    setModalOpen(true);
  }

  return (
    <div className="min-h-screen bg-white dark:bg-background text-gray-900 dark:text-gray-100 font-sans">
      <AuthModal open={modalOpen} defaultTab={modalTab} onClose={() => setModalOpen(false)} />

      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/95 dark:bg-background/95 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex h-14 items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={tradeflowLogo} alt="TradeFlowKit" className="h-8 w-8 rounded-lg object-contain" />
            <div>
              <span className="font-bold text-base tracking-tight leading-none">TradeFlow</span>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-none">TradeFlowKit.com</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => openModal("login")}
              className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              data-testid="nav-sign-in"
            >
              Sign In
            </button>
            <button
              onClick={() => openModal("register")}
              className="rounded-md bg-orange-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-orange-700 transition-colors"
              data-testid="nav-get-started"
            >
              Get Started Free
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-orange-50 via-amber-50 to-orange-50 text-gray-900 dark:from-slate-950 dark:via-orange-950 dark:to-slate-950 dark:text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-200/40 via-transparent to-transparent dark:from-orange-900/30" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-orange-100 border border-orange-200 px-3 py-1 text-xs text-orange-700 mb-6 dark:bg-orange-900/40 dark:border-orange-800/50 dark:text-orange-300">
              <Zap className="h-3 w-3" />
              Built for electricians, plumbers, HVAC & carpenters
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold leading-tight tracking-tight mb-6">
              Run your trade business{" "}
              <span className="bg-gradient-to-r from-orange-500 to-amber-400 bg-clip-text text-transparent dark:from-orange-400 dark:to-amber-300">
                from your phone
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 dark:text-slate-300 mb-8 max-w-2xl leading-relaxed">
              Jobs, quotes, invoices, customers, and team — all in one place. No spreadsheets.
              No chasing payments. No missed leads.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => openModal("register")}
                className="flex items-center gap-2 rounded-lg bg-orange-600 hover:bg-orange-500 px-6 py-3 text-sm font-semibold text-white transition-colors shadow-lg shadow-orange-200 dark:shadow-orange-900/40"
                data-testid="hero-get-started"
              >
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => openModal("login")}
                className="rounded-lg border border-gray-300 bg-white/80 hover:bg-white px-6 py-3 text-sm font-semibold text-gray-900 transition-colors backdrop-blur dark:border-white/20 dark:bg-white/10 dark:hover:bg-white/20 dark:text-white"
                data-testid="hero-sign-in"
              >
                Sign In
              </button>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-5 text-sm text-gray-600 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Free plan — no credit card
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Set up in under 5 minutes
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Works on any device
              </div>
            </div>
          </div>

          {/* Dashboard mock */}
          <div className="relative mt-12 md:mt-0 md:absolute md:right-0 md:top-1/2 md:-translate-y-1/2 md:w-[480px] lg:w-[560px] pointer-events-none" aria-hidden="true">
            <div className="rounded-xl border border-gray-200 bg-white/90 shadow-2xl shadow-gray-300/50 backdrop-blur overflow-hidden mx-4 md:mx-0 dark:border-white/10 dark:bg-slate-800/80 dark:shadow-black/40">
              <div className="bg-gray-100/90 px-4 py-2 flex items-center gap-2 border-b border-gray-200 dark:bg-slate-900/80 dark:border-white/10">
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                  <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
                  <div className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
                </div>
                <div className="flex-1 mx-4 h-4 rounded bg-gray-200 text-[10px] text-gray-500 flex items-center px-2 dark:bg-slate-700/60 dark:text-slate-400">tradeflowkit.com/dashboard</div>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "Today's Jobs", val: "3", color: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300" },
                    { label: "Overdue", val: "1", color: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" },
                    { label: "Pending Quotes", val: "$4,200", color: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
                    { label: "This Month", val: "$12,840", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" },
                  ].map((card) => (
                    <div key={card.label} className={`rounded-lg p-2 ${card.color}`}>
                      <div className="text-[9px] opacity-70 mb-0.5">{card.label}</div>
                      <div className="text-sm font-bold">{card.val}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg bg-gray-100 p-3 dark:bg-slate-700/40">
                  <div className="text-[10px] text-gray-500 mb-2 font-medium dark:text-slate-400">REVENUE — LAST 30 DAYS</div>
                  <div className="flex items-end gap-1 h-12">
                    {[4, 7, 3, 9, 5, 11, 6, 8, 12, 7, 4, 10, 14, 8, 6, 11, 9, 5, 8, 13, 7, 10, 15, 11, 6, 9, 12, 8, 14, 10].map((h, i) => (
                      <div key={i} className="flex-1 rounded-sm bg-orange-500/70" style={{ height: `${(h / 15) * 100}%` }} />
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-gray-100 p-2.5 dark:bg-slate-700/40">
                    <div className="text-[10px] text-gray-500 mb-1.5 font-medium dark:text-slate-400">TODAY'S SCHEDULE</div>
                    {["Panel upgrade · 9:00 AM", "Outlet repair · 11:30 AM", "New service · 2:00 PM"].map((job) => (
                      <div key={job} className="text-[10px] text-gray-700 py-1 border-b border-gray-200 last:border-0 dark:text-slate-300 dark:border-slate-600/40">{job}</div>
                    ))}
                  </div>
                  <div className="rounded-lg bg-gray-100 p-2.5 dark:bg-slate-700/40">
                    <div className="text-[10px] text-gray-500 mb-1.5 font-medium dark:text-slate-400">PIPELINE</div>
                    {[
                      { s: "Lead", n: 5, c: "bg-gray-400" },
                      { s: "Quoted", n: 3, c: "bg-orange-400" },
                      { s: "Scheduled", n: 3, c: "bg-orange-400" },
                      { s: "In Progress", n: 2, c: "bg-amber-400" },
                    ].map((row) => (
                      <div key={row.s} className="flex items-center gap-1.5 py-0.5">
                        <div className={`h-1.5 w-1.5 rounded-full ${row.c}`} />
                        <span className="text-[9px] text-gray-700 flex-1 dark:text-slate-300">{row.s}</span>
                        <span className="text-[9px] font-bold text-gray-900 dark:text-slate-200">{row.n}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem / Solution */}
      <section className="bg-white text-gray-900 py-16 md:py-20 dark:bg-background dark:text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="text-orange-600 dark:text-orange-500 text-xs font-bold uppercase tracking-widest mb-3">The Problem</div>
              <h2 className="text-3xl font-bold mb-5">Running a trade business shouldn't require 3 different apps and a spreadsheet</h2>
              <ul className="space-y-3 text-gray-600 dark:text-gray-400 text-sm">
                {[
                  "Missed calls become lost jobs",
                  "Quotes live in texts and emails",
                  "Invoices go unpaid for weeks",
                  "Customers call for job status updates",
                  "No idea which tech is available",
                  "Tax time is a paperwork nightmare",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="text-orange-600 dark:text-orange-500 mt-0.5">✕</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-widest mb-3">The Solution</div>
              <h2 className="text-3xl font-bold mb-5">One platform that handles your entire revenue pipeline</h2>
              <ul className="space-y-3 text-gray-700 dark:text-gray-300 text-sm">
                {[
                  "AI texts missed callers and captures new leads",
                  "Send professional quotes in 60 seconds",
                  "Customers pay invoices online by card",
                  "Real-time job status visible to the whole team",
                  "Workload view shows who is available right now",
                  "All jobs, quotes, and invoices in one place",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white dark:bg-background py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">How it works</h2>
            <p className="text-gray-500 dark:text-gray-400">From first contact to final payment — TradeFlow handles it all.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {steps.map((step) => (
              <div
                key={step.num}
                className="relative rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-card p-6"
                data-testid={`step-${step.num}`}
              >
                <div className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${step.color} text-white font-bold text-base mb-4`}>
                  {step.num}
                </div>
                <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="bg-gray-50 dark:bg-card py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Everything your business needs</h2>
            <p className="text-gray-500 dark:text-gray-400">Built for the job site, not the office.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="rounded-xl bg-white dark:bg-background border border-gray-100 dark:border-gray-800 p-5 hover:border-orange-200 dark:hover:border-orange-900 hover:shadow-sm transition-all"
                  data-testid={`feature-${f.title.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-950/40 mb-3">
                    <Icon className="h-5 w-5 text-orange-700 dark:text-orange-400" />
                  </div>
                  <h3 className="font-semibold mb-1">{f.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="bg-white dark:bg-background py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Built for your trade</h2>
            <p className="text-gray-500 dark:text-gray-400">Whether you work solo or run a crew, TradeFlow adapts to your business.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {useCases.map((uc) => (
              <div key={uc.trade} className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-card p-5">
                <div className="font-semibold mb-1.5">{uc.trade}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{uc.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-gray-50 dark:bg-card py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Simple, honest pricing</h2>
            <p className="text-gray-500 dark:text-gray-400">Start free. Upgrade when you're ready.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-xl border p-5 flex flex-col ${
                  plan.highlighted
                    ? "border-orange-600 bg-orange-600 text-white shadow-lg shadow-orange-200 dark:shadow-orange-950/40"
                    : "border-gray-200 dark:border-gray-800 bg-white dark:bg-background"
                }`}
                data-testid={`plan-${plan.name.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <div className="mb-4">
                  <div className={`text-xs font-medium uppercase tracking-wide mb-1 ${plan.highlighted ? "text-orange-200" : "text-gray-600 dark:text-gray-400"}`}>
                    {plan.name}
                  </div>
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-3xl font-extrabold">{plan.price}</span>
                    <span className={`text-sm ${plan.highlighted ? "text-orange-200" : "text-gray-600 dark:text-gray-400"}`}>{plan.period}</span>
                  </div>
                  <p className={`text-xs mt-1 ${plan.highlighted ? "text-orange-200" : "text-gray-500 dark:text-gray-400"}`}>{plan.desc}</p>
                </div>
                <ul className="space-y-1.5 flex-1 mb-5">
                  {plan.features.map((f) => (
                    <li key={f} className={`flex items-start gap-2 text-xs ${plan.highlighted ? "text-orange-100" : "text-gray-600 dark:text-gray-300"}`}>
                      <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${plan.highlighted ? "text-orange-200" : "text-emerald-600 dark:text-emerald-400"}`} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => openModal(plan.tab)}
                  className={`w-full rounded-lg py-2 text-sm font-semibold transition-colors ${
                    plan.highlighted
                      ? "bg-white text-orange-700 hover:bg-orange-50"
                      : "bg-orange-600 text-white hover:bg-orange-700"
                  }`}
                  data-testid={`plan-cta-${plan.name.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-white dark:bg-background py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Trusted by tradespeople</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {testimonials.map((t, i) => (
              <div key={i} className="rounded-xl bg-gray-50 dark:bg-card border border-gray-100 dark:border-gray-800 p-5" data-testid={`testimonial-${i}`}>
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: t.stars }).map((_, j) => (
                    <Star key={j} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-4">"{t.quote}"</p>
                <div>
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{t.trade}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-gray-50 dark:bg-card py-16 md:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Frequently asked questions</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-background overflow-hidden">
                <button
                  className="w-full text-left px-5 py-4 flex items-center justify-between gap-3 font-medium text-sm hover:bg-gray-50 dark:hover:bg-card transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  data-testid={`faq-${i}`}
                >
                  {faq.q}
                  <span className={`text-gray-600 dark:text-gray-400 transition-transform text-lg leading-none ${openFaq === i ? "rotate-45" : ""}`}>+</span>
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 text-sm text-gray-500 dark:text-gray-400 leading-relaxed border-t border-gray-100 dark:border-gray-800">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ecosystem cross-promotion */}
      <EcosystemSection />

      {/* Final CTA */}
      <section className="bg-gradient-to-br from-orange-50 via-amber-50 to-orange-50 text-gray-900 py-16 dark:from-slate-950 dark:via-orange-950 dark:to-slate-950 dark:text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-orange-100 border border-orange-200 px-3 py-1 text-xs text-orange-700 mb-5 dark:bg-orange-900/40 dark:border-orange-800/50 dark:text-orange-300">
            <Smartphone className="h-3 w-3" />
            Works on your phone in the field
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Start running a tighter operation today
          </h2>
          <p className="text-gray-600 dark:text-slate-300 text-base mb-8 max-w-xl mx-auto">
            Free to start. No credit card. Set up in minutes. Your whole team up and running the same day.
          </p>
          <button
            onClick={() => openModal("register")}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 hover:bg-orange-500 px-8 py-3.5 text-base font-semibold text-white transition-colors"
            data-testid="mobile-cta"
          >
            Get Started Free
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-50 border-t border-gray-200 py-10 dark:bg-background dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-6">
            <div className="flex items-center gap-2.5">
              <img src={tradeflowLogo} alt="TradeFlowKit" className="h-7 w-7 rounded object-contain" />
              <div>
                <div className="font-bold text-gray-900 dark:text-white text-sm leading-none">TradeFlow</div>
                <div className="text-[10px] text-gray-500 leading-none mt-0.5">TradeFlowKit.com</div>
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-500">
              <Link href="/privacy" className="hover:text-gray-900 dark:hover:text-gray-300 transition-colors">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-gray-900 dark:hover:text-gray-300 transition-colors">Terms of Service</Link>
              <a href="mailto:support@tradeflowkit.com" className="hover:text-gray-900 dark:hover:text-gray-300 transition-colors">Support</a>
            </div>
          </div>
          <div className="border-t border-gray-200 dark:border-gray-800 pt-6 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-5 gap-y-2 text-xs text-gray-600 dark:text-gray-500">
              <span className="text-gray-500 dark:text-gray-600 uppercase tracking-wider text-[10px] font-semibold">
                Sister products
              </span>
              <a href="https://shotgunninjas.com" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 dark:hover:text-gray-300 transition-colors" data-testid="footer-link-shotgunninjas">
                ShotgunNinjas.com
              </a>
              <a href="https://torqueshed.pro" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 dark:hover:text-gray-300 transition-colors" data-testid="footer-link-torqueshed">
                TorqueShed.pro
              </a>
              <a href="https://techdeck.app" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 dark:hover:text-gray-300 transition-colors" data-testid="footer-link-techdeck">
                TechDeck.app
              </a>
              <a href="https://pulsedesk.support" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 dark:hover:text-gray-300 transition-colors" data-testid="footer-link-pulsedesk">
                PulseDesk.support
              </a>
              <a href="https://faultlinelab.com" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 dark:hover:text-gray-300 transition-colors" data-testid="footer-link-faultlinelab">
                FaultlineLab.com
              </a>
              <a href="https://shotgunninjavillage.com" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 dark:hover:text-gray-300 transition-colors" data-testid="footer-link-village">
                ShotgunNinjaVillage.com
              </a>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-600">
              <span>© {new Date().getFullYear()} TradeFlowKit. Built by Shotgun Ninjas Productions.</span>
              <a
                href="https://shotgunninjas.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-gray-700 dark:hover:text-gray-400 transition-colors"
                data-testid="footer-link-ecosystem-hub"
              >
                Part of the Shotgun Ninjas Productions ecosystem
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
