"use client";

import { ArrowLeft, ArrowRight, Mic, Sparkles, Workflow } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./home-workspace.module.css";

type HomeWorkspaceProps = {
  onOpenImage: () => void;
  onOpenVideo: () => void;
};

const SLIDE_GAP = 32;

function HomeWorkspace({ onOpenImage, onOpenVideo }: HomeWorkspaceProps) {
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const dragState = useRef({
    pointerId: -1,
    isDragging: false,
    startX: 0,
    startScrollLeft: 0,
  });

  const getStep = useCallback(() => {
    const slider = sliderRef.current;
    const firstSlide = slider?.querySelector<HTMLElement>("[data-home-slide='true']");
    if (!slider || !firstSlide) {
      return 0;
    }

    return firstSlide.offsetWidth + SLIDE_GAP;
  }, []);

  const syncIndex = useCallback(() => {
    const slider = sliderRef.current;
    const step = getStep();
    if (!slider || !step) {
      return;
    }

    const nextIndex = Math.round(slider.scrollLeft / step);
    setCurrentIndex(Math.max(0, Math.min(3, nextIndex)));
  }, [getStep]);

  const scrollToIndex = useCallback(
    (index: number) => {
      const slider = sliderRef.current;
      const step = getStep();
      if (!slider || !step) {
        return;
      }

      const clampedIndex = Math.max(0, Math.min(3, index));
      slider.scrollTo({
        left: clampedIndex * step,
        behavior: "smooth",
      });
      setCurrentIndex(clampedIndex);
    },
    [getStep],
  );

  useEffect(() => {
    syncIndex();
    window.addEventListener("resize", syncIndex);

    return () => {
      window.removeEventListener("resize", syncIndex);
    };
  }, [syncIndex]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const slider = sliderRef.current;
    if (!slider) {
      return;
    }

    dragState.current = {
      pointerId: event.pointerId,
      isDragging: true,
      startX: event.clientX,
      startScrollLeft: slider.scrollLeft,
    };

    slider.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const slider = sliderRef.current;
    if (!slider || !dragState.current.isDragging) {
      return;
    }

    const delta = event.clientX - dragState.current.startX;
    slider.scrollLeft = dragState.current.startScrollLeft - delta;
  };

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const slider = sliderRef.current;
    if (!slider || !dragState.current.isDragging) {
      return;
    }

    dragState.current.isDragging = false;

    if (slider.hasPointerCapture(event.pointerId)) {
      slider.releasePointerCapture(event.pointerId);
    }

    syncIndex();
    scrollToIndex(Math.round(slider.scrollLeft / Math.max(getStep(), 1)));
  };

  return (
    <section className={styles.workspace}>
      <div
        ref={sliderRef}
        className={styles.slider}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onScroll={syncIndex}
      >
        <article className={`${styles.slide} ${styles.heroSlide}`} data-home-slide="true">
          <div className={styles.heroPanel}>
            <div className={styles.heroGlow} />
            <div className={styles.heroNoise} />
            <div className={styles.heroCopy}>
              <h1>Start by generating a free image</h1>
              <div className={styles.heroActions}>
                <button type="button" className={styles.primaryAction} onClick={onOpenImage}>
                  <span>Generate Image</span>
                  <ArrowRight size={20} />
                </button>
                <button type="button" className={styles.secondaryAction} onClick={onOpenVideo}>
                  <span>Generate Video</span>
                  <ArrowRight size={20} />
                </button>
              </div>
            </div>
            <div className={styles.geminiOrb} />
            <div className={`${styles.generateChip} ${styles.generateChipOne}`}>
              <Sparkles size={14} />
              <span>Gemini creating concept art...</span>
            </div>
            <div className={`${styles.generateChip} ${styles.generateChipTwo}`}>
              <Sparkles size={14} />
              <span>Refining lighting and detail...</span>
            </div>
          </div>
        </article>

        <article className={styles.slide} data-home-slide="true">
          <div className={styles.mediaPanel}>
            <div className={styles.voiceStage}>
              <div className={styles.tabletFrame}>
                <div className={styles.tabletChrome} />
                <div className={styles.voiceCanvas}>
                  <div className={styles.voiceObject} />
                  <div className={styles.voiceDock}>
                    <span className={styles.voiceTag}>
                      <Mic size={14} />
                      Voice nodes
                    </span>
                    <div className={styles.voiceWave}>
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <h2>Introducing Voice Mode</h2>
          </div>
        </article>

        <article className={styles.slide} data-home-slide="true">
          <div className={styles.mediaPanel}>
            <div className={styles.nanoStage}>
              <div className={styles.nanoSheet}>
                <div className={`${styles.nanoCard} ${styles.nanoWordmark}`}>Krea</div>
                <div className={styles.nanoCard}>
                  <div className={styles.nanoFace} />
                </div>
                <div className={styles.nanoCard}>
                  <div className={styles.nanoParrot} />
                </div>
                <div className={styles.nanoCard}>
                  <div className={styles.nanoDog} />
                </div>
              </div>
              <div className={styles.nanoCursor} />
              <div className={styles.nanoLabel}>
                <span>Nano Banana 2</span>
              </div>
            </div>
            <h2>Welcome Nano Banana 2</h2>
          </div>
        </article>

        <article className={styles.slide} data-home-slide="true">
          <div className={styles.mediaPanel}>
            <div className={styles.promptStage}>
              <div className={styles.promptCard}>
                <div className={styles.promptTextLine}>
                  Full product commercial with nano banana and kling motion control
                </div>
                <div className={styles.promptGhostAction}>
                  <Workflow size={15} />
                  <span>Try in Nodes</span>
                </div>
              </div>
            </div>
            <h2>Introducing Prompt-to-Workflow</h2>
          </div>
        </article>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.controlButton}
          aria-label="Previous slide"
          onClick={() => scrollToIndex(currentIndex - 1)}
        >
          <ArrowLeft size={24} />
        </button>
        <button
          type="button"
          className={styles.controlButton}
          aria-label="Next slide"
          onClick={() => scrollToIndex(currentIndex + 1)}
        >
          <ArrowRight size={24} />
        </button>
      </div>
    </section>
  );
}

export default HomeWorkspace;
