import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EllipsisIcon,
  GripVerticalIcon,
  ImageIcon,
  ImagePlusIcon,
  StarIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { Widget, WidgetHeader } from "@/kit/widgets/widget";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { VenuePhoto } from "@/lib/yoorker";

const MAX_PHOTOS = 20;
const MAX_EDGE = 2048;
const ACCEPT = "image/jpeg,image/png,image/webp";

interface Upload {
  id: string;
  preview: string;
  progress: number;
  error: string | null;
}

async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => {
    throw new Error("Couldn't read this photo. Use JPEG, PNG or WebP.");
  });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't prepare this photo"))),
      "image/jpeg",
      0.85,
    ),
  );
}

function put(
  url: string,
  headers: Record<string, string>,
  body: Blob,
  onProgress: (share: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    request.onload = () =>
      request.status < 300 ? resolve() : reject(new Error(`Upload failed (${request.status})`));
    request.onerror = () => reject(new Error("Upload failed. Check your connection."));
    request.send(body);
  });
}

function PhotoTile({
  photo,
  index,
  name,
  manager,
  onMakeCover,
  onDelete,
}: {
  photo: VenuePhoto;
  index: number;
  name: string;
  manager: boolean;
  onMakeCover: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: photo.id,
    disabled: !manager,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative overflow-hidden rounded-xl bg-muted",
        isDragging && "z-10 shadow-xl ring-2 ring-primary",
      )}
    >
      <img
        src={photo.url}
        alt={`${name}, photo ${index + 1}`}
        className="aspect-[4/3] w-full object-cover"
        draggable={false}
      />
      {index === 0 && (
        <Badge className="absolute start-2 top-2 gap-1 shadow-sm">
          <StarIcon className="size-3 fill-current" />
          Cover
        </Badge>
      )}
      {manager && (
        <>
          <button
            type="button"
            aria-label={`Move photo ${index + 1}`}
            className="absolute inset-0 cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVerticalIcon className="absolute bottom-2 start-2 size-5 rounded bg-black/40 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="secondary"
                  size="icon-sm"
                  aria-label={`Options for photo ${index + 1}`}
                  className="absolute end-2 top-2 bg-card/90 shadow-sm backdrop-blur-sm"
                />
              }
            >
              <EllipsisIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem disabled={index === 0} onClick={onMakeCover}>
                <StarIcon />
                Make cover
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2Icon />
                Delete photo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </li>
  );
}

export function VenuePhotos({
  venueId,
  name,
  manager,
}: {
  venueId: string;
  name: string;
  manager: boolean;
}) {
  const client = useQueryClient();
  const key = ["photos", venueId];
  const photos = useQuery({
    queryKey: key,
    queryFn: () => api<VenuePhoto[]>(`/venues/${venueId}/photos`),
    retry: false,
  });
  const list = photos.data ?? [];
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [confirming, setConfirming] = useState<VenuePhoto | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const pending = uploads.filter((u) => !u.error).length;
  const room = MAX_PHOTOS - list.length - pending;

  const patchUpload = (id: string, change: Partial<Upload>) =>
    setUploads((all) => all.map((u) => (u.id === id ? { ...u, ...change } : u)));

  const addFiles = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length < files.length) {
      toast.add({ type: "error", title: "Only photos can be added" });
    }
    const taken = images.slice(0, Math.max(room, 0));
    if (taken.length < images.length) {
      toast.add({
        type: "error",
        title: `A venue can have ${MAX_PHOTOS} photos`,
        description: `${images.length - taken.length} not added.`,
      });
    }
    const queued = taken.map((file) => ({
      file,
      upload: {
        id: crypto.randomUUID(),
        preview: URL.createObjectURL(file),
        progress: 0,
        error: null,
      } satisfies Upload,
    }));
    setUploads((all) => [...all, ...queued.map((q) => q.upload)]);

    for (const { file, upload } of queued) {
      try {
        const blob = await shrink(file);
        const link = await api<{
          objectKey: string;
          uploadUrl: string;
          headers: Record<string, string>;
        }>(`/venues/${venueId}/photos/uploads`, {
          body: { contentType: "image/jpeg", size: blob.size },
        });
        await put(link.uploadUrl, link.headers, blob, (share) =>
          patchUpload(upload.id, { progress: share }),
        );
        const added = await api<VenuePhoto>(`/venues/${venueId}/photos`, {
          body: { objectKey: link.objectKey },
        });
        client.setQueryData<VenuePhoto[]>(key, (old = []) => [...old, added]);
        URL.revokeObjectURL(upload.preview);
        setUploads((all) => all.filter((u) => u.id !== upload.id));
      } catch (error) {
        patchUpload(upload.id, { error: error instanceof Error ? error.message : String(error) });
      }
    }
  };

  const saveOrder = async (next: VenuePhoto[]) => {
    const before = list;
    client.setQueryData(key, next);
    try {
      const saved = await api<VenuePhoto[]>(`/venues/${venueId}/photos/order`, {
        method: "PUT",
        body: { photoIds: next.map((p) => p.id) },
      });
      client.setQueryData(key, saved);
    } catch (error) {
      client.setQueryData(key, before);
      toast.add({
        type: "error",
        title: "Couldn't save the order",
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = list.findIndex((p) => p.id === active.id);
    const to = list.findIndex((p) => p.id === over.id);
    void saveOrder(arrayMove(list, from, to));
  };

  const remove = async (photo: VenuePhoto) => {
    setConfirming(null);
    try {
      await api(`/venues/${venueId}/photos/${photo.id}`, { method: "DELETE" });
      client.setQueryData<VenuePhoto[]>(key, (old = []) => old.filter((p) => p.id !== photo.id));
      toast.add({ type: "success", title: "Photo deleted" });
    } catch (error) {
      toast.add({
        type: "error",
        title: "Couldn't delete the photo",
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const picker = (
    <input
      ref={input}
      type="file"
      accept={ACCEPT}
      multiple
      hidden
      onChange={(e) => {
        void addFiles([...(e.target.files ?? [])]);
        e.target.value = "";
      }}
    />
  );

  return (
    <Widget
      onDragOver={(e) => {
        if (!manager || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
      }}
      onDrop={(e) => {
        if (!manager) return;
        e.preventDefault();
        setDragOver(false);
        void addFiles([...e.dataTransfer.files]);
      }}
      className={cn(dragOver && "ring-2 ring-primary ring-offset-2 ring-offset-background")}
    >
      <WidgetHeader
        title={
          <span className="flex items-center gap-2">
            Photos
            <span className="text-sm font-normal text-muted-foreground tabular-nums">
              {list.length}/{MAX_PHOTOS}
            </span>
          </span>
        }
        icon={ImageIcon}
        action={
          manager &&
          list.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={room <= 0}
              onClick={() => input.current?.click()}
            >
              <ImagePlusIcon data-icon="inline-start" />
              Add photos
            </Button>
          )
        }
      />
      {picker}
      <div className="px-(--card-spacing)">
        {list.length === 0 && uploads.length === 0 ? (
          manager ? (
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UploadIcon className="size-5" />
              </span>
              <span className="font-medium">Drag photos here, or choose them</span>
              <span className="text-sm text-muted-foreground">
                Up to {MAX_PHOTOS} photos. The first one is the cover players see.
              </span>
            </button>
          ) : (
            <p className="text-sm text-muted-foreground">No photos yet.</p>
          )
        ) : (
          <>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={list.map((p) => p.id)} strategy={rectSortingStrategy}>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {list.map((photo, index) => (
                    <PhotoTile
                      key={photo.id}
                      photo={photo}
                      index={index}
                      name={name}
                      manager={manager}
                      onMakeCover={() => void saveOrder(arrayMove(list, index, 0))}
                      onDelete={() => setConfirming(photo)}
                    />
                  ))}
                  {uploads.map((u) => (
                    <li key={u.id} className="relative overflow-hidden rounded-xl bg-muted">
                      <img
                        src={u.preview}
                        alt=""
                        className={cn("aspect-[4/3] w-full object-cover", !u.error && "opacity-60")}
                      />
                      {u.error ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/85 p-3 text-center">
                          <span className="text-xs text-destructive">{u.error}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              URL.revokeObjectURL(u.preview);
                              setUploads((all) => all.filter((x) => x.id !== u.id));
                            }}
                          >
                            Dismiss
                          </Button>
                        </div>
                      ) : (
                        <div className="absolute inset-x-3 bottom-3 h-1.5 overflow-hidden rounded-full bg-background/70">
                          <div
                            className="h-full rounded-full bg-primary transition-[width]"
                            style={{ width: `${Math.max(u.progress, 0.04) * 100}%` }}
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
            {manager && (
              <p className="mt-3 text-xs text-muted-foreground">
                Drag to reorder. The first photo is the cover players see.
              </p>
            )}
          </>
        )}
      </div>

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this photo?</DialogTitle>
            <DialogDescription>
              Players won&apos;t see it on your venue page any more.
            </DialogDescription>
          </DialogHeader>
          {confirming && (
            <img
              src={confirming.url}
              alt=""
              className="aspect-[4/3] w-full rounded-lg object-cover"
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => confirming && void remove(confirming)}>
              Delete photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Widget>
  );
}
