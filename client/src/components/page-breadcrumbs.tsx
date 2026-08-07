import React from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

interface PageBreadcrumbsProps {
  items: BreadcrumbSegment[];
  fallback?: string;
  className?: string;
}

export function PageBreadcrumbs({ items, fallback = "/", className }: PageBreadcrumbsProps) {
  const [, navigate] = useLocation();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      navigate(fallback);
    }
  };

  return (
    <div
      className={cn("flex items-center gap-3 py-2 mb-4", className)}
      data-testid="nav-breadcrumbs"
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={handleBack}
        className="h-8 gap-1.5 px-2.5 text-muted-foreground hover:text-foreground shrink-0"
        data-testid="button-back"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        <span className="hidden sm:inline text-sm">Back</span>
      </Button>
      <div className="w-px h-4 bg-border shrink-0" />
      <Breadcrumb>
        <BreadcrumbList>
          {(() => {
            const nodes: React.ReactNode[] = [];
            items.forEach((item, index) => {
              const isLast = index === items.length - 1;
              nodes.push(
                <BreadcrumbItem key={`item-${index}`}>
                  {isLast ? (
                    <BreadcrumbPage className="max-w-[200px] truncate font-medium text-foreground">
                      {item.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={item.href ?? "/"} data-testid={`breadcrumb-link-${index}`}>
                        {item.label}
                      </Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>,
              );
              if (!isLast) {
                nodes.push(<BreadcrumbSeparator key={`sep-${index}`} />);
              }
            });
            return nodes;
          })()}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
