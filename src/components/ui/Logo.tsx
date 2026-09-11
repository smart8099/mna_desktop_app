import logoUrl from "@/assets/logo.png";
import { cn } from "@/lib/cn";

export function Logo({ className, alt = "Madrasatul Nurul Absar" }: { className?: string; alt?: string }) {
  return <img src={logoUrl} alt={alt} className={cn("object-contain", className)} />;
}
