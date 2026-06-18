import { ExternalLink, Wrench, Terminal, Search } from "lucide-react";

const ecosystemProducts = [
  {
    name: "TorqueShed",
    domain: "torqueshed.pro",
    url: "https://torqueshed.pro",
    icon: Wrench,
    tagline: "Automotive diagnostics & shop floor",
    desc: "Run TradeFlow in the office, run TorqueShed in the bay. Built for mechanics who handle their own diagnostics, parts, and repair cases.",
    relevance: "Best fit if you also do auto repair work",
  },
  {
    name: "TechDeck",
    domain: "techdeck.app",
    url: "https://techdeck.app",
    icon: Terminal,
    tagline: "IT automation & power-user scripts",
    desc: "Automate the boring back-office stuff — backups, monitoring, network checks, tech onboarding. Pairs with TradeFlow for low-voltage and IT trades.",
    relevance: "Best fit for IT, low-voltage, A/V, security install",
  },
  {
    name: "FaultlineLab",
    domain: "faultlinelab.com",
    url: "https://faultlinelab.com",
    icon: Search,
    tagline: "Diagnostic challenge & training",
    desc: "Sharpen your team's diagnostic logic with structured fault-finding challenges. Great for apprentice training and weekly skill drills.",
    relevance: "Best fit for training apprentices & junior techs",
  },
];

export function EcosystemSection() {
  return (
    <section className="bg-white dark:bg-background py-16 md:py-20" data-testid="section-ecosystem">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 mb-3">
            Shotgun Ninjas Productions ecosystem
          </div>
          <h2 className="text-3xl font-bold mb-3">Tools that work with TradeFlow</h2>
          <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
            Same team, same playbook. Add the pieces that fit your trade — none of them are required.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {ecosystemProducts.map((p) => {
            const Icon = p.icon;
            return (
              <a
                key={p.name}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-card p-5 hover:border-red-300 dark:hover:border-red-900 hover:shadow-md transition-all flex flex-col"
                data-testid={`ecosystem-card-${p.name.toLowerCase()}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-lg bg-gray-100 dark:bg-gray-800 group-hover:bg-red-50 dark:group-hover:bg-red-950/40 flex items-center justify-center transition-colors">
                      <Icon className="h-4 w-4 text-gray-600 dark:text-gray-300 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{p.name}</div>
                      <div className="text-[11px] text-gray-400 dark:text-gray-500">{p.domain}</div>
                    </div>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600 group-hover:text-red-500 dark:group-hover:text-red-400 transition-colors" />
                </div>
                <div className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-2">{p.tagline}</div>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed flex-1 mb-3">{p.desc}</p>
                <div className="text-[11px] text-gray-400 dark:text-gray-500 italic border-t border-gray-100 dark:border-gray-800 pt-3">
                  {p.relevance}
                </div>
              </a>
            );
          })}
        </div>
        <div className="text-center mt-8">
          <a
            href="https://shotgunninjas.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            data-testid="link-ecosystem-hub"
          >
            See the full ecosystem at shotgunninjas.com
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </section>
  );
}
