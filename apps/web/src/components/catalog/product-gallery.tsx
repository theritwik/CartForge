'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { ProductImage } from '@/lib/catalog-api';

export function ProductGallery({ images }: { images: ProductImage[] }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedImage = images[selectedIndex];

  if (!selectedImage) {
    return (
      <div className="bg-surface text-muted flex aspect-square items-center justify-center rounded-lg text-sm">
        No image available
      </div>
    );
  }

  return (
    <div>
      <div className="bg-surface aspect-square overflow-hidden rounded-lg">
        <Image
          src={selectedImage.url}
          alt={selectedImage.altText}
          width={800}
          height={800}
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="h-full w-full object-cover"
        />
      </div>
      {images.length > 1 && (
        <ul className="mt-3 flex gap-3">
          {images.map((image, index) => (
            <li key={image.url}>
              <button
                type="button"
                onClick={() => {
                  setSelectedIndex(index);
                }}
                aria-label={`Show image ${index + 1} of ${images.length}`}
                aria-current={index === selectedIndex}
                className={`bg-surface ring-offset-background block h-16 w-16 overflow-hidden rounded-md ring-offset-2 sm:h-20 sm:w-20 ${
                  index === selectedIndex ? 'ring-foreground ring-2' : ''
                }`}
              >
                <Image src={image.url} alt="" width={160} height={160} className="h-full w-full" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
