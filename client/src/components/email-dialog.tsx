import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Loader2, CheckCircle2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface EmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentType: "quote" | "invoice";
  documentId: string;
  documentNumber: string;
  defaultRecipient?: string;
  defaultSubject: string;
  defaultMessage: string;
  onSent?: () => void;
}

export function EmailDialog({
  open,
  onOpenChange,
  documentType,
  documentId,
  documentNumber,
  defaultRecipient,
  defaultSubject,
  defaultMessage,
  onSent,
}: EmailDialogProps) {
  const { toast } = useToast();
  const [to, setTo] = useState(defaultRecipient || "");
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTo(defaultRecipient || "");
      setSubject(defaultSubject);
      setMessage(defaultMessage);
      setSentTo(null);
    }
  }, [open, defaultRecipient, defaultSubject, defaultMessage]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const endpoint =
        documentType === "quote"
          ? `/api/quotes/${documentId}/send-email`
          : `/api/invoices/${documentId}/send-email`;
      const res = await apiRequest("POST", endpoint, {
        to: to.trim(),
        subject: subject.trim() || undefined,
        message: message.trim() || undefined,
      });
      return (await res.json()) as { ok: boolean; sentTo: string };
    },
    onSuccess: (data) => {
      setSentTo(data.sentTo);
      toast({
        title: "Email sent",
        description: `${documentType === "quote" ? "Quote" : "Invoice"} sent to ${data.sentTo}`,
      });
      onSent?.();
      setTimeout(() => onOpenChange(false), 1200);
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to send email",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());

  return (
    <Dialog open={open} onOpenChange={(v) => !sendMutation.isPending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email {documentType === "quote" ? "Quote" : "Invoice"} #{documentNumber}
          </DialogTitle>
          <DialogDescription>
            Send the PDF as an attachment. Customer will receive a branded email with the PDF.
          </DialogDescription>
        </DialogHeader>

        {sentTo ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3" data-testid="email-sent-confirmation">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
            <p className="text-sm font-medium">Delivered to {sentTo}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email-to">To</Label>
              <Input
                id="email-to"
                type="email"
                placeholder="customer@example.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                aria-invalid={to.length > 0 && !isValidEmail}
                data-testid="input-email-to"
              />
              {to.length > 0 && !isValidEmail && (
                <p className="text-xs font-medium text-destructive" data-testid="error-email-to">
                  Enter a valid email address
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-subject">Subject</Label>
              <Input
                id="email-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                data-testid="input-email-subject"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-message">Message</Label>
              <Textarea
                id="email-message"
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add a personal note (optional)"
                data-testid="input-email-message"
              />
            </div>
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2.5">
              The PDF will be attached automatically as <strong>{documentType === "quote" ? "Quote" : "Invoice"}-{documentNumber}.pdf</strong>.
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={sendMutation.isPending}
                data-testid="button-cancel-email"
              >
                Cancel
              </Button>
              <Button
                onClick={() => sendMutation.mutate()}
                disabled={!isValidEmail || sendMutation.isPending}
                data-testid="button-send-email"
              >
                {sendMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Sending...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-1" /> Send Email
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
