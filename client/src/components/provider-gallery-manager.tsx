import { useState, useRef, useCallback } from "react";
import { GalleryThumbnail } from "@/components/ui/provider-image";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Image as ImageIcon, Trash2, ChevronUp, ChevronDown, Pencil, Check, X, Loader2, Upload, Plus } from "lucide-react";

interface GalleryImage {
  id: string;
  providerId: string;
  imageUrl: string;
  publicId: string | null;
  caption: string | null;
  sortOrder: number;
  createdAt: string;
}

const MAX_IMAGES = 10;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

export function ProviderGalleryManager() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const { data: images = [], isLoading } = useQuery<GalleryImage[]>({
    queryKey: ["/api/provider/gallery"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, caption }: { id: string; caption: string }) => {
      const res = await fetch(`/api/provider/gallery/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ caption }),
      });
      if (!res.ok) throw new Error("Failed to update caption");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/gallery"] });
      setEditingId(null);
    },
    onError: () => toast({ title: "Failed to update caption", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/provider/gallery/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/gallery"] });
      toast({ title: "Photo removed" });
    },
    onError: () => toast({ title: "Failed to delete photo", variant: "destructive" }),
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const res = await fetch("/api/provider/gallery/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ orderedIds }),
      });
      if (!res.ok) throw new Error("Failed to reorder");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/provider/gallery"] }),
    onError: () => toast({ title: "Failed to reorder", variant: "destructive" }),
  });

  async function uploadFile(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({ title: "Unsupported format. Use JPG, PNG, or WebP", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "Photo must be under 5 MB", variant: "destructive" });
      return;
    }
    if (images.length >= MAX_IMAGES) {
      toast({ title: `Gallery limit is ${MAX_IMAGES} photos`, variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", file);

      const token = localStorage.getItem("token");
      const res = await fetch("/api/provider/gallery/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Upload failed");

      queryClient.invalidateQueries({ queryKey: ["/api/provider/gallery"] });
      toast({ title: "Photo uploaded to gallery" });
    } catch (err: any) {
      toast({ title: err?.message ?? "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }, [images.length, uploading]);

  function moveImage(index: number, direction: "up" | "down") {
    const sorted = [...images];
    const swapIdx = direction === "up" ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    [sorted[index], sorted[swapIdx]] = [sorted[swapIdx], sorted[index]];
    reorderMutation.mutate(sorted.map(img => img.id));
  }

  function startEdit(img: GalleryImage) {
    setEditingId(img.id);
    setEditCaption(img.caption ?? "");
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-primary" />
          <span className="font-medium">Gallery</span>
          <Badge variant="secondary">{images.length} / {MAX_IMAGES}</Badge>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            · Stored on Cloudinary
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={images.length >= MAX_IMAGES || uploading}
          onClick={() => fileInputRef.current?.click()}
          data-testid="button-add-gallery-image"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          {uploading ? "Uploading…" : "Add Photo"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          className="hidden"
          onChange={handleFileSelect}
          data-testid="input-gallery-file"
        />
      </div>

      {/* Drop zone (shown when gallery is empty) */}
      {images.length === 0 && (
        <Card
          className={`border-dashed transition-colors ${dragOver ? "border-primary bg-primary/5" : ""}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className={`rounded-full p-3 mb-3 ${dragOver ? "bg-primary/10" : "bg-muted"}`}>
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">{dragOver ? "Drop to upload" : "No photos yet"}</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Add up to {MAX_IMAGES} photos (JPG, PNG, WebP · max 5 MB each).
              Photos are stored externally on Cloudinary.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-4"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              data-testid="button-add-first-gallery-image"
            >
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              {uploading ? "Uploading…" : "Add your first photo"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Drop overlay when gallery has images */}
      {images.length > 0 && (
        <div
          className={`border-2 border-dashed rounded-xl transition-all ${dragOver ? "border-primary bg-primary/5 p-2" : "border-transparent"}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {dragOver && (
            <div className="flex items-center justify-center py-4 text-primary font-medium text-sm gap-2">
              <Upload className="h-4 w-4" /> Drop to add photo
            </div>
          )}

          {/* Grid */}
          <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 ${dragOver ? "opacity-50" : ""}`}>
            {images.map((img, idx) => (
              <div key={img.id} className="group relative flex flex-col gap-2" data-testid={`card-gallery-${img.id}`}>
                <div className="relative">
                  <GalleryThumbnail
                    src={img.imageUrl}
                    alt={img.caption ?? `Gallery photo ${idx + 1}`}
                    caption={null}
                  />
                  {/* Hover overlay */}
                  <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-7 w-7"
                      onClick={() => moveImage(idx, "up")}
                      disabled={idx === 0 || reorderMutation.isPending}
                      title="Move left"
                      data-testid={`button-move-up-${img.id}`}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-7 w-7"
                      onClick={() => moveImage(idx, "down")}
                      disabled={idx === images.length - 1 || reorderMutation.isPending}
                      title="Move right"
                      data-testid={`button-move-down-${img.id}`}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-7 w-7"
                      onClick={() => startEdit(img)}
                      title="Edit caption"
                      data-testid={`button-edit-caption-${img.id}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-7 w-7"
                      onClick={() => deleteMutation.mutate(img.id)}
                      disabled={deleteMutation.isPending}
                      title="Delete photo"
                      data-testid={`button-delete-gallery-${img.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Position badge */}
                  <div className="absolute top-1.5 left-1.5">
                    <span className="text-[10px] bg-black/60 text-white rounded px-1 py-0.5 font-mono leading-none">
                      {idx + 1}
                    </span>
                  </div>
                </div>

                {/* Caption */}
                {editingId === img.id ? (
                  <div className="flex gap-1">
                    <Input
                      value={editCaption}
                      onChange={e => setEditCaption(e.target.value)}
                      placeholder="Add caption…"
                      className="h-7 text-xs"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === "Enter") updateMutation.mutate({ id: img.id, caption: editCaption });
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      data-testid={`input-caption-${img.id}`}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={() => updateMutation.mutate({ id: img.id, caption: editCaption })}
                      disabled={updateMutation.isPending}
                      data-testid={`button-save-caption-${img.id}`}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={() => setEditingId(null)}
                      data-testid={`button-cancel-caption-${img.id}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <p
                    className="text-xs text-muted-foreground truncate cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => startEdit(img)}
                    data-testid={`text-caption-${img.id}`}
                  >
                    {img.caption || <span className="italic">Add caption…</span>}
                  </p>
                )}
              </div>
            ))}

            {/* Add more tile */}
            {images.length < MAX_IMAGES && (
              <button
                type="button"
                className="aspect-square rounded-xl border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                data-testid="button-add-more-gallery"
              >
                {uploading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <Plus className="h-6 w-6" />
                )}
                <span className="text-xs font-medium">{uploading ? "Uploading…" : "Add photo"}</span>
              </button>
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        JPG · PNG · WebP &nbsp;·&nbsp; Max 5 MB per photo &nbsp;·&nbsp; Up to {MAX_IMAGES} photos &nbsp;·&nbsp; Images compressed &amp; hosted on Cloudinary
      </p>
    </div>
  );
}
