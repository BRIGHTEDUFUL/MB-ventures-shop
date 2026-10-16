import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  /** Resolved image URLs for the current selection, in display order. */
  srcs: string[];
  /** Which of them is showing. Out-of-range values clamp to the last photo. */
  index: number;
  onIndexChange: (index: number) => void;
  /** The product's name — alt text for every photo and the zoom viewer's title. */
  name: string;
};

/**
 * The product page's photo viewer: one large photo, a step-through control and
 * the thumbnail strip.
 *
 * The arrows and the swipe gesture only exist when there is more than one
 * photo — a control that can never do anything is noise. Swipes are horizontal
 * only (`touchAction: pan-y` keeps vertical scrolling with the page), so a
 * thumb resting on the photo never traps the shopper's scroll.
 */
export function ProductGallery({ srcs, index, onIndexChange, name }: Props) {
  const [zoom, setZoom] = useState(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const many = srcs.length > 1;
  // The list can shrink underneath the index — a new option may carry fewer
  // photos than the last one — so clamp to a photo that actually exists.
  const at = Math.min(Math.max(index, 0), srcs.length - 1);
  const step = (delta: number) => onIndexChange((at + delta + srcs.length) % srcs.length);

  return (
    <>
      <div
        className="gallery"
        style={{ touchAction: "pan-y" }}
        onTouchStart={(e) => {
          const t = e.changedTouches[0];
          if (t) swipeStart.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const start = swipeStart.current;
          swipeStart.current = null;
          if (start === null || !many) return;
          const t = e.changedTouches[0];
          if (!t) return;
          const dx = t.clientX - start.x,
            dy = t.clientY - start.y;
          // Only a deliberate horizontal drag counts; anything diagonal or
          // vertical belongs to the page's scroll.
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
        }}
      >
        <img src={srcs[at]} alt={`${name}, photo ${at + 1} of ${srcs.length}`} />
        {many && (
          <>
            <Button
              variant="outline"
              className="icon-control absolute top-1/2 left-3 -translate-y-1/2 rounded-full"
              title="Previous photo"
              aria-label="Previous image"
              onClick={() => step(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              className="icon-control absolute top-1/2 right-3 -translate-y-1/2 rounded-full"
              title="Next photo"
              aria-label="Next image"
              onClick={() => step(1)}
            >
              <ChevronRight />
            </Button>
            <span
              aria-hidden="true"
              className="absolute bottom-4 left-4 flex h-11 items-center rounded-full bg-background/80 px-4 font-mono text-xs text-muted-foreground"
            >
              {at + 1} / {srcs.length}
            </span>
          </>
        )}
        <Button
          variant="outline"
          className="icon-control absolute right-4 bottom-4 rounded-full"
          title="Zoom image"
          onClick={() => setZoom(true)}
          aria-label="Zoom product image"
        >
          <ZoomIn />
        </Button>
      </div>
      <div className="gallery-thumbs">
        {srcs.map((src, i) => (
          <Button
            variant="ghost"
            key={src}
            className="h-auto p-0"
            aria-label={`View product image ${i + 1}`}
            onClick={() => onIndexChange(i)}
          >
            <img className={i === at ? "ring-2 ring-link" : ""} src={src} alt={`View ${i + 1}`} />
          </Button>
        ))}
      </div>
      <Dialog.Root open={zoom} onOpenChange={setZoom}>
        <Dialog.Portal>
          <Dialog.Overlay className="scrim" />
          <Dialog.Content
            className="search-panel !top-8 !max-h-[90vh]"
            aria-describedby={undefined}
          >
            <Dialog.Title className="mb-5 text-lg">{name}</Dialog.Title>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                className="overlay-close icon-control"
                aria-label="Close product viewer"
              >
                <X />
              </Button>
            </Dialog.Close>
            <div className="relative">
              <img
                src={srcs[at]}
                alt={`${name}, photo ${at + 1} of ${srcs.length}`}
                className="max-h-[75vh] w-full object-contain"
              />
              {many && (
                <>
                  <Button
                    variant="outline"
                    className="icon-control absolute top-1/2 left-3 -translate-y-1/2 rounded-full"
                    aria-label="Zoom previous image"
                    onClick={() => step(-1)}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="outline"
                    className="icon-control absolute top-1/2 right-3 -translate-y-1/2 rounded-full"
                    aria-label="Zoom next image"
                    onClick={() => step(1)}
                  >
                    <ChevronRight />
                  </Button>
                </>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
