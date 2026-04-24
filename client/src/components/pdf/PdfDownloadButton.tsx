import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";

interface PdfDownloadButtonProps {
  filename: string;
  children?: React.ReactNode;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  testId?: string;
  onBeforePrint?: () => void;
}

export function PdfDownloadButton({
  filename,
  children,
  variant = "outline",
  size = "sm",
  className,
  testId,
  onBeforePrint,
}: PdfDownloadButtonProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const prevTitleRef = useRef<string>("");

  const handleDownload = () => {
    if (isPrinting) return;

    onBeforePrint?.();
    setIsPrinting(true);

    prevTitleRef.current = document.title;
    document.title = filename;
    document.body.classList.add("pdf-mode");

    const cleanup = () => {
      document.body.classList.remove("pdf-mode");
      document.title = prevTitleRef.current;
      setIsPrinting(false);
      window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);
    setTimeout(() => {
      window.print();
      setTimeout(cleanup, 500);
    }, 50);
  };

  return (
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
  );
}
