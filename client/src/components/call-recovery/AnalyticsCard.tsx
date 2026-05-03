import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Lock } from "lucide-react";
import type { CRStats } from "./types";

export function AnalyticsCard({ stats, hasAnalytics }: { stats: CRStats | undefined; hasAnalytics: boolean }) {
  if (!hasAnalytics) {
    return (
      <Card className="border-dashed" data-testid="card-cr-analytics-upsell">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Analytics Dashboard
          </CardTitle>
          <CardDescription>Recovery rate, conversion stats, and monthly trends</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-4 gap-3 text-center">
          <Lock className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Available on the Pro plan</p>
          <Badge variant="outline" className="text-xs">Pro only</Badge>
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  return (
    <Card data-testid="card-cr-analytics">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          This Month's Performance
        </CardTitle>
        <CardDescription>Recovery analytics for the current billing period</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-3 rounded-lg bg-muted/40">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.recovered}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Recovered</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/40">
            <p className="text-2xl font-bold text-foreground">{stats.recoveryRate}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">Conversion Rate</p>
            {stats.lastMonthRecoveryRate > 0 && (
              <p className={`text-[10px] mt-0.5 ${stats.recoveryRate >= stats.lastMonthRecoveryRate ? "text-green-600" : "text-red-500"}`}>
                {stats.recoveryRate >= stats.lastMonthRecoveryRate ? "↑" : "↓"} vs {stats.lastMonthRecoveryRate}% last mo
              </p>
            )}
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/40">
            <p className="text-2xl font-bold text-foreground">{stats.inProgress}</p>
            <p className="text-xs text-muted-foreground mt-0.5">In Progress</p>
          </div>
          {stats.estimatedRevenue > 0 && (
            <div className="text-center p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20">
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                ${stats.estimatedRevenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Est. Revenue</p>
            </div>
          )}
        </div>

        {stats.funnel && stats.funnel.missed > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Recovery Funnel</p>
            <div className="space-y-1.5">
              {[
                { label: "Missed", value: stats.funnel.missed, color: "bg-slate-400" },
                { label: "Contacted", value: stats.funnel.contacted, color: "bg-primary/60" },
                { label: "Responded", value: stats.funnel.responded, color: "bg-amber-400" },
                { label: "Recovered", value: stats.funnel.recovered, color: "bg-green-500" },
              ].map((stage) => {
                const pct = stats.funnel.missed > 0 ? Math.round((stage.value / stats.funnel.missed) * 100) : 0;
                return (
                  <div key={stage.label} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16 shrink-0">{stage.label}</span>
                    <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
                      <div
                        className={`h-full ${stage.color} rounded-sm transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium w-8 text-right">{stage.value}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
