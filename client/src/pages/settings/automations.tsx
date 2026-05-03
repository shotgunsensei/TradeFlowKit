import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Info, ExternalLink, Star, Zap, ArrowUpDown } from "lucide-react";
import type { OrgAutomations, ReviewRequestWithDetails } from "@shared/schema";

const INVOICE_REMINDER_DAY_OPTIONS = [3, 7, 14];
const QUOTE_FOLLOWUP_DAY_OPTIONS = [3, 5, 7];

export default function AutomationsTab({ plan }: { plan: string }) {
  const { org } = useAuth();
  const { toast } = useToast();

  const [reviewEnabled, setReviewEnabled] = useState<boolean>(org?.reviewRequestEnabled ?? false);
  const [reviewUrl, setReviewUrl] = useState<string>(org?.reviewRequestUrl ?? "");
  const [reviewTemplate, setReviewTemplate] = useState<string>(
    org?.reviewRequestTemplate ?? "Hi {customer}, thanks for choosing {business}! We'd love your feedback. Please leave us a review: {google_link}"
  );
  const [reviewHistorySort, setReviewHistorySort] = useState<"desc" | "asc">("desc");
  const [reviewHistoryFrom, setReviewHistoryFrom] = useState<string>("");
  const [reviewHistoryTo, setReviewHistoryTo] = useState<string>("");
  const [reviewHistoryLimit, setReviewHistoryLimit] = useState<number>(25);

  const { data: automations } = useQuery<OrgAutomations>({
    queryKey: ["/api/automations"],
    enabled: !!org,
  });

  const [invoiceReminderEnabled, setInvoiceReminderEnabled] = useState<boolean | null>(null);
  const [invoiceReminderDays, setInvoiceReminderDays] = useState<number[] | null>(null);
  const [quoteFollowUpEnabled, setQuoteFollowUpEnabled] = useState<boolean | null>(null);
  const [quoteFollowUpDays, setQuoteFollowUpDays] = useState<number[] | null>(null);

  const effectiveInvoiceReminder = invoiceReminderEnabled ?? automations?.invoiceReminder ?? false;
  const effectiveInvoiceReminderDays = invoiceReminderDays ?? automations?.invoiceReminderDays ?? [3, 7, 14];
  const effectiveQuoteFollowUp = quoteFollowUpEnabled ?? automations?.quoteFollowUp ?? false;
  const effectiveQuoteFollowUpDays = quoteFollowUpDays ?? automations?.quoteFollowUpDays ?? [3, 5, 7];

  const saveAutomationsMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/automations", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automations"] });
      toast({ title: "Automation settings saved" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save automation settings", variant: "destructive" });
    },
  });

  const reviewHistoryParams = new URLSearchParams({
    limit: String(reviewHistoryLimit),
    offset: "0",
    sort: reviewHistorySort,
  });
  if (reviewHistoryFrom) reviewHistoryParams.set("from", new Date(reviewHistoryFrom).toISOString());
  if (reviewHistoryTo) {
    const toDate = new Date(reviewHistoryTo);
    toDate.setDate(toDate.getDate() + 1);
    reviewHistoryParams.set("to", toDate.toISOString());
  }

  const { data: reviewHistory, isLoading: reviewHistoryLoading } = useQuery<{ items: ReviewRequestWithDetails[]; total: number }>({
    queryKey: ["/api/review-requests", reviewHistorySort, reviewHistoryFrom, reviewHistoryTo, reviewHistoryLimit],
    queryFn: async () => {
      const res = await fetch(`/api/review-requests?${reviewHistoryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch review history");
      return res.json();
    },
    enabled: !!org,
  });

  return (
    <div className="space-y-6">
      {/* SMS Reminders Section */}
      {plan !== "small_business" && plan !== "enterprise" ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3 text-sm">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Small Business plan required</p>
                <p className="text-muted-foreground mt-1">Automated SMS reminders are available on the Small Business plan and above. Upgrade your plan to enable this feature.</p>
                <a href="/subscription" className="mt-3 inline-block">
                  <Button variant="outline" size="sm" className="mt-2" data-testid="button-upgrade-for-automations">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Upgrade Plan
                  </Button>
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Overdue Invoice Reminders</CardTitle>
              <CardDescription>Automatically send an SMS to customers when an invoice becomes overdue</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="switch-invoice-reminder" className="font-medium">Enable invoice reminders</Label>
                <Switch
                  id="switch-invoice-reminder"
                  checked={effectiveInvoiceReminder}
                  onCheckedChange={(checked) => setInvoiceReminderEnabled(checked)}
                  data-testid="switch-invoice-reminder"
                />
              </div>
              {effectiveInvoiceReminder && (
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Send reminder when invoice is overdue by:</Label>
                  <div className="flex flex-wrap gap-3" data-testid="invoice-reminder-days">
                    {INVOICE_REMINDER_DAY_OPTIONS.map((day) => (
                      <div key={day} className="flex items-center gap-1.5">
                        <Checkbox
                          id={`inv-day-${day}`}
                          checked={effectiveInvoiceReminderDays.includes(day)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setInvoiceReminderDays([...effectiveInvoiceReminderDays, day].sort((a, b) => a - b));
                            } else {
                              setInvoiceReminderDays(effectiveInvoiceReminderDays.filter(d => d !== day));
                            }
                          }}
                          data-testid={`checkbox-inv-day-${day}`}
                        />
                        <Label htmlFor={`inv-day-${day}`} className="text-sm font-normal cursor-pointer">{day} days</Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quote Follow-ups</CardTitle>
              <CardDescription>Automatically follow up with customers who haven't responded to a sent quote</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="switch-quote-followup" className="font-medium">Enable quote follow-ups</Label>
                <Switch
                  id="switch-quote-followup"
                  checked={effectiveQuoteFollowUp}
                  onCheckedChange={(checked) => setQuoteFollowUpEnabled(checked)}
                  data-testid="switch-quote-followup"
                />
              </div>
              {effectiveQuoteFollowUp && (
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Send follow-up after quote has been sent for:</Label>
                  <div className="flex flex-wrap gap-3" data-testid="quote-followup-days">
                    {QUOTE_FOLLOWUP_DAY_OPTIONS.map((day) => (
                      <div key={day} className="flex items-center gap-1.5">
                        <Checkbox
                          id={`qt-day-${day}`}
                          checked={effectiveQuoteFollowUpDays.includes(day)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setQuoteFollowUpDays([...effectiveQuoteFollowUpDays, day].sort((a, b) => a - b));
                            } else {
                              setQuoteFollowUpDays(effectiveQuoteFollowUpDays.filter(d => d !== day));
                            }
                          }}
                          data-testid={`checkbox-qt-day-${day}`}
                        />
                        <Label htmlFor={`qt-day-${day}`} className="text-sm font-normal cursor-pointer">{day} days</Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => saveAutomationsMutation.mutate({
                invoiceReminder: effectiveInvoiceReminder,
                invoiceReminderDays: effectiveInvoiceReminderDays,
                quoteFollowUp: effectiveQuoteFollowUp,
                quoteFollowUpDays: effectiveQuoteFollowUpDays,
              })}
              disabled={saveAutomationsMutation.isPending}
              data-testid="button-save-automations"
            >
              {saveAutomationsMutation.isPending ? "Saving..." : "Save Automation Settings"}
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base text-muted-foreground flex items-center gap-2">
                <Info className="h-4 w-4" />
                How it works
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>SMS reminders are sent automatically via Twilio to the customer's phone number on file.</p>
              <p>Customers can reply <strong>STOP</strong> at any time to opt out of future reminders.</p>
              <p>Each reminder is logged and visible in the reminder history on the invoice and quote records.</p>
              <p>Reminders run every 30 minutes — only one reminder is sent per day per invoice/quote.</p>
            </CardContent>
          </Card>
        </>
      )}

      {/* Review Requests Section */}
      {(plan === "free") ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Zap className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="font-medium">Upgrade to unlock Review Requests</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Review requests are available on the Individual plan and above.
                </p>
              </div>
              <a href="/subscription">
                <Button size="sm" data-testid="button-upgrade-automations">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Upgrade Plan
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-base">Review Request</CardTitle>
            </div>
            <CardDescription>
              Automatically send an SMS asking customers to leave a review when a job is marked as Done or Paid.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Enable Review Requests</p>
                <p className="text-xs text-muted-foreground">Send SMS automatically on job completion</p>
              </div>
              <Switch
                checked={reviewEnabled}
                onCheckedChange={setReviewEnabled}
                data-testid="switch-review-enabled"
              />
            </div>

            <div className="space-y-2">
              <Label>Review Link URL</Label>
              <Input
                value={reviewUrl}
                onChange={(e) => setReviewUrl(e.target.value)}
                placeholder="https://g.page/r/your-business-review"
                data-testid="input-review-url"
              />
              <p className="text-xs text-muted-foreground">
                Your Google review link, Yelp page, or any review URL
              </p>
            </div>

            <div className="space-y-2">
              <Label>SMS Template</Label>
              <Textarea
                value={reviewTemplate}
                onChange={(e) => setReviewTemplate(e.target.value)}
                rows={4}
                data-testid="textarea-review-template"
              />
              <p className="text-xs text-muted-foreground">
                Use <code className="bg-muted px-1 rounded text-xs">{"{customer}"}</code>,{" "}
                <code className="bg-muted px-1 rounded text-xs">{"{business}"}</code>,{" "}
                <code className="bg-muted px-1 rounded text-xs">{"{google_link}"}</code> as placeholders.
              </p>
            </div>

            {reviewUrl && (
              <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">SMS Preview</p>
                <p className="text-sm">
                  {reviewTemplate
                    .replace("{customer}", "John Smith")
                    .replace("{business}", org?.name || "Your Business")
                    .replace("{google_link}", reviewUrl)}
                </p>
              </div>
            )}

            <Button
              onClick={() => saveAutomationsMutation.mutate({
                reviewRequestEnabled: reviewEnabled,
                reviewRequestUrl: reviewUrl,
                reviewRequestTemplate: reviewTemplate,
              })}
              disabled={saveAutomationsMutation.isPending}
              data-testid="button-save-automations"
            >
              {saveAutomationsMutation.isPending ? "Saving..." : "Save Automation Settings"}
            </Button>
          </CardContent>
        </Card>
      )}

      {plan !== "free" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review Request History</CardTitle>
            <CardDescription>
              Customers who have already been sent a review request SMS.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  value={reviewHistoryFrom}
                  onChange={(e) => { setReviewHistoryFrom(e.target.value); setReviewHistoryLimit(25); }}
                  className="w-[160px]"
                  data-testid="input-review-history-from"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  value={reviewHistoryTo}
                  onChange={(e) => { setReviewHistoryTo(e.target.value); setReviewHistoryLimit(25); }}
                  className="w-[160px]"
                  data-testid="input-review-history-to"
                />
              </div>
              {(reviewHistoryFrom || reviewHistoryTo) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setReviewHistoryFrom(""); setReviewHistoryTo(""); setReviewHistoryLimit(25); }}
                  data-testid="button-clear-history-filter"
                >
                  Clear filter
                </Button>
              )}
            </div>

            {reviewHistoryLoading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>
            ) : !reviewHistory || reviewHistory.items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center" data-testid="text-review-history-empty">
                No review requests found{(reviewHistoryFrom || reviewHistoryTo) ? " for the selected date range" : " yet"}.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table data-testid="table-review-history">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Job</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-foreground"
                          onClick={() => setReviewHistorySort(reviewHistorySort === "desc" ? "asc" : "desc")}
                          data-testid="button-sort-date"
                        >
                          Date Sent {reviewHistorySort === "desc" ? "↓" : "↑"}
                          <ArrowUpDown className="h-3.5 w-3.5" />
                        </button>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reviewHistory.items.map((rr) => (
                      <TableRow key={rr.id} data-testid={`row-review-${rr.id}`}>
                        <TableCell data-testid={`text-customer-${rr.id}`}>
                          {rr.customerName ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell data-testid={`text-job-${rr.id}`}>
                          {rr.jobTitle ? (
                            <Link
                              href={`/jobs/${rr.jobId}`}
                              className="text-primary hover:underline"
                              data-testid={`link-job-${rr.id}`}
                            >
                              {rr.jobTitle}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs" data-testid={`text-phone-${rr.id}`}>
                          {rr.phoneNumber}
                        </TableCell>
                        <TableCell data-testid={`text-date-${rr.id}`}>
                          {new Date(rr.sentAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex items-center justify-between mt-3">
                  <p className="text-xs text-muted-foreground" data-testid="text-history-count">
                    Showing {reviewHistory.items.length} of {reviewHistory.total}
                  </p>
                  {reviewHistory.total > reviewHistory.items.length && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setReviewHistoryLimit(Math.min(reviewHistoryLimit + 25, 100))}
                      disabled={reviewHistoryLimit >= 100}
                      data-testid="button-load-more-history"
                    >
                      {reviewHistoryLimit >= 100 ? "Max 100 shown" : "Load more"}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
