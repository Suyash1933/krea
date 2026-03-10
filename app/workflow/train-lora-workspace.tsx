"use client";

import { ArrowRight } from "lucide-react";
import { useRef } from "react";
import styles from "./train-lora-workspace.module.css";

function LoraBadge({ large = false }: { large?: boolean }) {
  return (
    <span className={`${styles.loraBadge} ${large ? styles.loraBadgeLarge : ""}`}>
      <span className={styles.loraOrb} />
    </span>
  );
}

function TrainLoraWorkspace() {
  const emptyStateRef = useRef<HTMLDivElement | null>(null);
  const heroRef = useRef<HTMLElement | null>(null);

  const scrollToEmptyState = () => {
    emptyStateRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToHero = () => {
    heroRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className={styles.workspace}>
      <section ref={heroRef} className={styles.heroSection}>
        <div className={styles.heroBackdrop}>
          <div className={`${styles.posterCard} ${styles.posterCardOne}`} />
          <div className={`${styles.posterCard} ${styles.posterCardTwo}`} />
          <div className={`${styles.posterCard} ${styles.posterCardThree}`} />
          <div className={`${styles.posterCard} ${styles.posterCardFour}`} />
        </div>

        <div className={styles.heroShade} />

        <div className={styles.heroContent}>
          <div className={styles.titleRow}>
            <LoraBadge large />
            <h1>Train Lora</h1>
          </div>
          <p>
            Teach a model to generate specific styles, faces, or products. Upload images of the
            same subject and let Krea analyze the content over a few minutes. Load your Loras in
            the image and video models to use them.
          </p>
          <button type="button" className={styles.primaryButton} onClick={scrollToEmptyState}>
            <span>Train new Lora</span>
            <ArrowRight size={20} />
          </button>
        </div>
      </section>

      <section ref={emptyStateRef} className={styles.emptySection}>
        <div className={styles.emptyStateCard}>
          <LoraBadge />
          <h2>No LoRAs yet</h2>
          <p>
            Loras are customized models. Upload images of the same object, face, or style, to
            teach models how to reproduce them.
          </p>
          <button type="button" className={styles.emptyButton} onClick={scrollToHero}>
            Train Lora
          </button>
          <button type="button" className={styles.learnMoreButton} onClick={scrollToHero}>
            Learn More
          </button>
        </div>
      </section>
    </section>
  );
}

export default TrainLoraWorkspace;
