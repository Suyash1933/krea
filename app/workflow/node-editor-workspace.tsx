"use client";

import {
  AppWindow,
  ArrowRight,
  ExternalLink,
  LayoutTemplate,
  PlaySquare,
  Workflow,
} from "lucide-react";
import { useRef, useState } from "react";
import styles from "./node-editor-workspace.module.css";

type TabId = "projects" | "apps" | "examples" | "templates";

type PreviewCard = {
  title: string;
  description: string;
  meta: string;
};

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "projects", label: "Projects" },
  { id: "apps", label: "Apps" },
  { id: "examples", label: "Examples" },
  { id: "templates", label: "Templates" },
];

const appCards: PreviewCard[] = [
  {
    title: "Portrait Pipeline",
    description: "Chain image prompt, style transfer, and enhancer nodes into one polished run.",
    meta: "App",
  },
  {
    title: "Video Remix",
    description: "Connect prompt, start frame, duration, and aspect settings into a reusable app.",
    meta: "App",
  },
  {
    title: "Brand Asset Loop",
    description: "Generate campaign visuals, product shots, and refinements from one workflow.",
    meta: "App",
  },
];

const exampleCards: PreviewCard[] = [
  {
    title: "Black and White Portrait",
    description: "Convert a source portrait into a high-contrast monochrome editorial result.",
    meta: "Example",
  },
  {
    title: "Motion Prompt Graph",
    description: "Route prompt, pose guidance, and generation settings into a video output node.",
    meta: "Example",
  },
  {
    title: "Product Restyle Stack",
    description: "Blend product references, prompt edits, and upscale passes in one graph.",
    meta: "Example",
  },
];

const templateCards: PreviewCard[] = [
  {
    title: "Image Starter",
    description: "A minimal graph for prompt to image generations.",
    meta: "Template",
  },
  {
    title: "Video Starter",
    description: "A clean starting point for prompt to video experiments.",
    meta: "Template",
  },
  {
    title: "Edit Stack",
    description: "Reference image plus edit prompt workflow with reusable controls.",
    meta: "Template",
  },
  {
    title: "Creative Batch",
    description: "Duplicate-ready graph for running multiple style variations quickly.",
    meta: "Template",
  },
];

function NodeEditorWorkspace() {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("projects");

  const openTab = (tab: TabId) => {
    setActiveTab(tab);
    contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const renderCards = (cards: PreviewCard[]) => (
    <div className={styles.cardGrid}>
      {cards.map((card) => (
        <article key={card.title} className={styles.previewPanelCard}>
          <span className={styles.previewPanelMeta}>{card.meta}</span>
          <h3>{card.title}</h3>
          <p>{card.description}</p>
        </article>
      ))}
    </div>
  );

  return (
    <section className={styles.workspace}>
      <section className={styles.heroSection}>
        <div className={styles.heroVisual}>
          <div className={`${styles.flowCard} ${styles.flowCardOne}`}>
            <div className={styles.flowCardHeader}>
              <span className={styles.flowCardLabel}>Input file</span>
            </div>
            <div className={styles.flowImagePortrait} />
            <div className={styles.flowFooterRow}>
              <span className={styles.flowDotBlue} />
              <span className={styles.flowDotBlue} />
              <span className={styles.flowPill}>Settings</span>
            </div>
          </div>

          <div className={`${styles.flowCard} ${styles.flowCardTwo}`}>
            <div className={styles.flowCardHeader}>
              <span className={styles.flowCardLabel}>ChatGPT Image</span>
              <span className={styles.flowCardMeta}>183 CU</span>
            </div>
            <div className={styles.flowWideImage} />
            <div className={styles.flowPromptCard}>
              <span className={styles.promptTag}>Prompt</span>
              <p>
                Convert the input portrait into a dramatic monochrome photograph while preserving
                identity and expression.
              </p>
            </div>
          </div>

          <div className={`${styles.flowCard} ${styles.flowCardThree}`}>
            <div className={styles.flowCardHeader}>
              <span className={styles.flowCardLabel}>Seedance Pro Fast - Video</span>
            </div>
            <div className={styles.flowTallImage} />
            <div className={styles.flowPromptCard}>
              <span className={styles.promptTag}>Prompt</span>
              <p>Model doing subtle movements, realistic facial motion, cinematic portrait.</p>
            </div>
          </div>

          <span className={`${styles.connector} ${styles.connectorOne}`} />
          <span className={`${styles.connector} ${styles.connectorTwo}`} />
          <span className={`${styles.connector} ${styles.connectorThree}`} />
        </div>

        <div className={styles.heroShade} />

        <div className={styles.heroContent}>
          <div className={styles.heroTitleWrap}>
            <span className={styles.heroBadge}>
              <Workflow size={28} />
            </span>
            <h1>Node Editor</h1>
          </div>
          <p>
            Nodes is the most powerful way to operate Krea. Connect every tool and model into
            complex automated pipelines.
          </p>
          <button type="button" className={styles.primaryButton} onClick={() => openTab("projects")}>
            <span>New Workflow</span>
            <ArrowRight size={20} />
          </button>
        </div>
      </section>

      <section ref={contentRef} className={styles.contentSection}>
        <div className={styles.tabRail}>
          <div className={styles.tabRow}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`${styles.tabButton} ${activeTab === tab.id ? styles.tabActive : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.contentBody}>
          <div className={styles.contentInner}>
            {activeTab === "projects" ? (
              <div className={styles.emptyStateWrap}>
                <div className={styles.emptyStateCard}>
                  <span className={styles.emptyStateIcon}>
                    <Workflow size={30} />
                  </span>
                  <h2>No Workflows Yet</h2>
                  <p>
                    You haven&apos;t created any workflows yet.
                    <br />
                    Get started by creating your first one.
                  </p>
                  <button
                    type="button"
                    className={styles.emptyStatePrimaryBtn}
                    onClick={() => openTab("projects")}
                  >
                    New Workflow
                  </button>
                  <button
                    type="button"
                    className={styles.learnMoreLink}
                    onClick={() => openTab("templates")}
                  >
                    <span>Learn More</span>
                    <ExternalLink size={18} />
                  </button>
                </div>
              </div>
            ) : null}

            {activeTab === "apps" ? (
              <div className={styles.previewSection}>
                <div className={styles.previewSectionHead}>
                  <AppWindow size={18} />
                  <span>Apps</span>
                </div>
                {renderCards(appCards)}
              </div>
            ) : null}

            {activeTab === "examples" ? (
              <div className={styles.previewSection}>
                <div className={styles.previewSectionHead}>
                  <PlaySquare size={18} />
                  <span>Examples</span>
                </div>
                {renderCards(exampleCards)}
              </div>
            ) : null}

            {activeTab === "templates" ? (
              <div className={styles.previewSection}>
                <div className={styles.previewSectionHead}>
                  <LayoutTemplate size={18} />
                  <span>Templates</span>
                </div>
                {renderCards(templateCards)}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </section>
  );
}

export default NodeEditorWorkspace;
