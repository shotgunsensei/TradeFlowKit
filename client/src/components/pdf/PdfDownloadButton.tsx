import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";

interface PdfDownloadButtonProps {
  filename: string;
  loadPdf: () => Promise<React.ReactElement>;
  children?: React.ReactNode;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  testId?: string;
}

export function PdfDownloadButton({
  filename,
  loadPdf,
  children,
  variant = "outline",
  size = "sm",
  className,
  testId,
}: PdfDownloadButtonProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [pdfElement, setPdfElement] = useState<React.ReactElement | null>(null);
  const prevTitleRef = useRef<string>("");

  const handleDownload = async () => {
    if (isPrinting) return;
    setIsPrinting(true);

    try {
      const element = await loadPdf();
      setPdfElement(element);

      prevTitleRef.current = document.title;
      document.title = filename;
      document.body.classList.add("pdf-mode");

      const cleanup = () => {
        document.body.classList.remove("pdf-mode");
        document.title = prevTitleRef.current;
        setPdfElement(null);
        setIsPrinting(false);
        window.removeEventListener("afterprint", cleanup);
      };

      window.addEventListener("afterprint", cleanup);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.print();
          setTimeout(cleanup, 500);
        });
      });
    } catch {
      setIsPrinting(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleDownload}
        disabled={isPrinting}
        className={className}
        data-testid={testId}
      >
        <FileDown className="h-4 w-4 mr-1" />
        {children ?? (isPrinting ? "Preparing..." : "Download PDF")}
      </Button>
      {pdfElement && createPortal(pdfElement, document.body)}
    </>
  );
}
