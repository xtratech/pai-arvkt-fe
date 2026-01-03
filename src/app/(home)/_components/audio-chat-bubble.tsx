"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type AudioChatBubbleProps = {
  src: string;
  title?: string;
  description?: string;
};

export function AudioChatBubble({
  src,
  title = "Audio Note",
  description = "Play quick overview",
}: AudioChatBubbleProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handleToggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        // ignore autoplay restrictions
      }
      return;
    }
    audio.pause();
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.pause();
    };
  }, []);

  return (
    <div className="flex items-start">
      <div className="max-w-full rounded-2xl bg-white px-4 py-3 text-sm text-dark-5 shadow-sm ring-1 ring-stroke dark:bg-dark-2 dark:text-dark-6 dark:ring-dark-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleToggle}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stroke bg-gray-1 text-dark transition hover:bg-gray-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:border-dark-3 dark:bg-dark-3 dark:text-white dark:hover:bg-dark-4"
            aria-label={isPlaying ? "Pause audio" : "Play audio"}
            aria-pressed={isPlaying}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
                <path
                  d="M7 5H10V19H7V5ZM14 5H17V19H14V5Z"
                  fill="currentColor"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
                <path d="M8 5L19 12L8 19V5Z" fill="currentColor" />
              </svg>
            )}
          </button>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-dark-4 dark:text-dark-7">
              {title}
            </div>
            <div className="text-sm font-medium text-dark dark:text-white">{description}</div>
          </div>
        </div>
        <audio ref={audioRef} src={src} preload="none" />
      </div>
    </div>
  );
}
