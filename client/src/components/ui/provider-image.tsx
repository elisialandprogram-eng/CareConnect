import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Stethoscope, Image as ImageIcon, FileText } from "lucide-react";

function getInitials(name?: string | null): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return (parts[0][0] ?? "").toUpperCase();
  return ((parts[0][0] ?? "") + (parts[parts.length - 1][0] ?? "")).toUpperCase();
}

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  className?: string;
}

export function AvatarXS({ src, name, className }: AvatarProps) {
  const initials = getInitials(name);
  return (
    <Avatar className={cn("h-6 w-6 shrink-0", className)}>
      <AvatarImage src={src ?? undefined} alt={name ?? undefined} loading="lazy" />
      <AvatarFallback className="text-[9px] font-semibold bg-muted text-muted-foreground">
        {initials || <User className="h-3 w-3" />}
      </AvatarFallback>
    </Avatar>
  );
}

export function AvatarSM({ src, name, className }: AvatarProps) {
  const initials = getInitials(name);
  return (
    <Avatar className={cn("h-10 w-10 shrink-0", className)}>
      <AvatarImage src={src ?? undefined} alt={name ?? undefined} loading="lazy" />
      <AvatarFallback className="text-sm font-semibold bg-muted text-muted-foreground">
        {initials || <User className="h-4 w-4" />}
      </AvatarFallback>
    </Avatar>
  );
}

export function AvatarMD({ src, name, className }: AvatarProps) {
  const initials = getInitials(name);
  return (
    <Avatar className={cn("h-16 w-16 shrink-0", className)}>
      <AvatarImage src={src ?? undefined} alt={name ?? undefined} loading="lazy" />
      <AvatarFallback className="text-xl font-semibold bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
        {initials || <User className="h-6 w-6" />}
      </AvatarFallback>
    </Avatar>
  );
}

export function AvatarLG({ src, name, className }: AvatarProps) {
  const initials = getInitials(name);
  return (
    <Avatar className={cn("h-24 w-24 shrink-0", className)}>
      <AvatarImage src={src ?? undefined} alt={name ?? undefined} loading="lazy" />
      <AvatarFallback className="text-2xl font-semibold bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
        {initials || <User className="h-8 w-8" />}
      </AvatarFallback>
    </Avatar>
  );
}

export function ProfileHeroImage({ src, name, className }: AvatarProps) {
  const initials = getInitials(name);
  return (
    <Avatar className={cn("h-40 w-40 shrink-0 border-4 border-border shadow-lg", className)}>
      <AvatarImage src={src ?? undefined} alt={name ?? undefined} loading="lazy" />
      <AvatarFallback className="text-4xl font-semibold bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
        {initials || <Stethoscope className="h-14 w-14" />}
      </AvatarFallback>
    </Avatar>
  );
}

interface GalleryThumbnailProps {
  src?: string | null;
  alt?: string | null;
  caption?: string | null;
  className?: string;
  onClick?: () => void;
  "data-testid"?: string;
}

export function GalleryThumbnail({ src, alt, caption, className, onClick, "data-testid": testId }: GalleryThumbnailProps) {
  if (src) {
    return (
      <div
        className={cn("relative overflow-hidden rounded-xl bg-muted aspect-square border hover:opacity-90 transition-opacity", onClick && "cursor-pointer", className)}
        onClick={onClick}
        data-testid={testId}
      >
        <img
          src={src}
          alt={alt ?? caption ?? "Gallery image"}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={(e) => {
            const target = e.currentTarget;
            target.style.display = "none";
            const parent = target.parentElement;
            if (parent) {
              parent.innerHTML = '<div class="flex items-center justify-center h-full w-full"><svg xmlns=\'http://www.w3.org/2000/svg\' width=\'32\' height=\'32\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'1.5\' class=\'text-muted-foreground/40\'><rect width=\'18\' height=\'18\' x=\'3\' y=\'3\' rx=\'2\' ry=\'2\'/><circle cx=\'9\' cy=\'9\' r=\'2\'/><path d=\'m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\'/></svg></div>';
            }
          }}
        />
        {caption && (
          <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-2 py-1 truncate">
            {caption}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className={cn("flex items-center justify-center rounded-xl bg-muted aspect-square border", className)} data-testid={testId}>
      <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
    </div>
  );
}

interface ServiceThumbnailProps {
  src?: string | null;
  name?: string | null;
  className?: string;
}

export function ServiceThumbnail({ src, name, className }: ServiceThumbnailProps) {
  if (src) {
    return (
      <div className={cn("overflow-hidden rounded-lg bg-muted shrink-0 h-9 w-9", className)}>
        <img
          src={src}
          alt={name ?? "Service"}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      </div>
    );
  }
  return (
    <div className={cn("flex items-center justify-center rounded-lg bg-primary/10 shrink-0 h-9 w-9", className)}>
      <Stethoscope className="h-4 w-4 text-primary/60" />
    </div>
  );
}

interface DocumentThumbnailProps {
  src?: string | null;
  alt?: string | null;
  className?: string;
  onClick?: () => void;
}

export function DocumentThumbnail({ src, alt, className, onClick }: DocumentThumbnailProps) {
  const isPdf = src?.toLowerCase().includes(".pdf") || src?.toLowerCase().includes("/pdf");
  if (src && !isPdf) {
    return (
      <div
        className={cn("overflow-hidden rounded-md h-12 w-12 border bg-muted shrink-0", onClick && "cursor-pointer", className)}
        onClick={onClick}
      >
        <img src={src} alt={alt ?? "Document"} className="h-full w-full object-cover" loading="lazy" />
      </div>
    );
  }
  return (
    <div
      className={cn("flex items-center justify-center rounded-md bg-muted h-12 w-12 border shrink-0", onClick && "cursor-pointer", className)}
      onClick={onClick}
    >
      <FileText className="h-6 w-6 text-muted-foreground" />
    </div>
  );
}
