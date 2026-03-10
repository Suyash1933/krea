"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Cuboid,
  Heart,
  Image as ImageIcon,
  MonitorUp,
  PersonStanding,
  Search,
  Upload,
  Video,
  WandSparkles,
} from "lucide-react";
import styles from "./assets-workspace.module.css";

type AssetItem = {
  id: string;
  mimeType: string;
  createdAt: string;
  sessionId: string;
  sessionTitle: string;
  generationId: string;
  prompt: string;
  modelAlias: string;
  frameSizeLabel: string;
  resolutionLabel: string;
  toolType: "Image" | "Video";
};

type ImageAssetItem = AssetItem & {
  toolType: "Image";
  imageUrl: string;
  aspectLabel: string;
};

type VideoAssetItem = AssetItem & {
  toolType: "Video";
  videoUrl: string;
  previewImageUrl: string | null;
  durationLabel: string;
};

type WorkspaceAssetItem = ImageAssetItem | VideoAssetItem;

type AssetsResponse = {
  assets?: WorkspaceAssetItem[];
  error?: string;
};

type GroupedAssets = {
  key: string;
  label: string;
  items: WorkspaceAssetItem[];
};

type CategoryFilter = "All" | "Favorites";

const toolFilters = [
  { label: "Image", icon: ImageIcon },
  { label: "Video", icon: Video },
  { label: "Edited", icon: WandSparkles },
  { label: "Enhanced", icon: WandSparkles },
  { label: "3D Object", icon: Cuboid },
  { label: "Motion Transfer", icon: PersonStanding },
  { label: "Uploaded", icon: Upload },
] as const;

const readJsonSafely = async <T,>(response: Response): Promise<T | null> => {
  const raw = await response.text();
  if (!raw.trim()) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const getRelativeDayLabel = (isoDate: string) => {
  const createdAt = new Date(isoDate);
  const now = new Date();

  const createdStart = new Date(
    createdAt.getFullYear(),
    createdAt.getMonth(),
    createdAt.getDate()
  );
  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffDays = Math.max(
    0,
    Math.floor((nowStart.getTime() - createdStart.getTime()) / (24 * 60 * 60 * 1000))
  );

  if (diffDays === 0) {
    return "Today";
  }

  if (diffDays === 1) {
    return "Yesterday";
  }

  if (diffDays <= 7) {
    return `${diffDays} days ago`;
  }

  return createdAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const parseFrameSize = (frameSizeLabel: string) => {
  const [widthText, heightText] = frameSizeLabel.split(":");
  const width = Number.parseInt(widthText, 10);
  const height = Number.parseInt(heightText, 10);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 1, height: 1 };
  }

  return { width, height };
};

const hashText = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const buildFallbackUrl = (asset: WorkspaceAssetItem) => {
  const { width, height } = parseFrameSize(asset.frameSizeLabel);
  const seed = hashText(`${asset.id}-${asset.prompt}`) % 1_000_000_000;
  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
};

const getAssetPreviewUrl = (asset: WorkspaceAssetItem) => {
  if (asset.toolType === "Image") {
    return asset.imageUrl;
  }

  return asset.previewImageUrl || buildFallbackUrl(asset);
};

export default function AssetsWorkspace() {
  const [assets, setAssets] = useState<WorkspaceAssetItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("All");
  const [toolFilter, setToolFilter] = useState<string>("Image");
  const [zoomValue, setZoomValue] = useState(56);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeAsset, setActiveAsset] = useState<WorkspaceAssetItem | null>(null);

  const gridScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const loadAssets = async () => {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/assets", { cache: "no-store" });
      const payload = (await readJsonSafely<AssetsResponse>(response)) ?? {};

      if (!response.ok) {
        setError(payload.error ?? "Failed to load assets.");
        setAssets([]);
        setIsLoading(false);
        return;
      }

      const nextAssets = payload.assets ?? [];
      setAssets(nextAssets);
      setIsLoading(false);
    };

    void loadAssets();
  }, []);

  const filteredAssets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return assets.filter((asset) => {
      if (toolFilter === "Image" && asset.toolType !== "Image") {
        return false;
      }

      if (toolFilter === "Video" && asset.toolType !== "Video") {
        return false;
      }

      if (toolFilter !== "Image" && toolFilter !== "Video") {
        return false;
      }

      if (categoryFilter === "Favorites" && !favoriteIds.has(asset.id)) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = `${asset.prompt} ${asset.sessionTitle} ${asset.modelAlias}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [assets, categoryFilter, favoriteIds, searchQuery, toolFilter]);

  const groupedAssets = useMemo<GroupedAssets[]>(() => {
    const grouped = new Map<string, GroupedAssets>();

    filteredAssets.forEach((asset) => {
      const label = getRelativeDayLabel(asset.createdAt);
      const key = `${label}-${asset.createdAt.slice(0, 10)}`;

      const existing = grouped.get(key);
      if (existing) {
        existing.items.push(asset);
        return;
      }

      grouped.set(key, {
        key,
        label,
        items: [asset],
      });
    });

    return Array.from(grouped.values());
  }, [filteredAssets]);

  const zoomSize = useMemo(() => {
    const min = 112;
    const max = 292;
    return Math.round(min + ((max - min) * zoomValue) / 100);
  }, [zoomValue]);

  const allCount = assets.length;
  const favoritesCount = favoriteIds.size;

  const imageCount = assets.filter((asset) => asset.toolType === "Image").length;
  const videoCount = assets.filter((asset) => asset.toolType === "Video").length;

  useEffect(() => {
    const container = gridScrollRef.current;
    if (!container) {
      return;
    }

    const updateProgress = () => {
      const maxScrollTop = container.scrollHeight - container.clientHeight;
      if (maxScrollTop <= 0) {
        setScrollProgress(0);
        return;
      }
      setScrollProgress(container.scrollTop / maxScrollTop);
    };

    updateProgress();
    container.addEventListener("scroll", updateProgress, { passive: true });

    return () => {
      container.removeEventListener("scroll", updateProgress);
    };
  }, [filteredAssets.length]);

  const toggleFavorite = (assetId: string) => {
    setFavoriteIds((previous) => {
      const next = new Set(previous);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  return (
    <section className={styles.assetsWorkspace}>
      <div className={styles.assetsMainColumn}>
        <div className={styles.zoomPanel}>
          <span className={styles.zoomIconWrap}>
            <MonitorUp size={15} />
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={zoomValue}
            onChange={(event) => setZoomValue(Number.parseInt(event.target.value, 10))}
            className={styles.zoomSlider}
            aria-label="Zoom assets"
          />
        </div>

        <div ref={gridScrollRef} className={styles.assetsScrollArea}>
          {isLoading ? <p className={styles.statusText}>Loading assets...</p> : null}
          {!isLoading && error ? <p className={styles.errorText}>{error}</p> : null}
          {!isLoading && !error && filteredAssets.length === 0 ? (
            <p className={styles.statusText}>No assets found yet. Generate images or videos to fill your library.</p>
          ) : null}

          {!isLoading && !error
            ? groupedAssets.map((group) => (
                <section key={group.key} className={styles.timelineGroup}>
                  <h2 className={styles.timelineHeading}>
                    {group.label}
                    <span className={styles.timelineAdd}>+</span>
                  </h2>

                  <div className={styles.assetGrid} style={{ "--asset-size": `${zoomSize}px` } as CSSProperties}>
                    {group.items.map((asset) => {
                      const { width, height } = parseFrameSize(asset.frameSizeLabel);
                      const ratio = Math.max(0.55, Math.min(1.9, width / height));
                      const isFavorite = favoriteIds.has(asset.id);
                      const previewUrl = getAssetPreviewUrl(asset);

                      return (
                        <article
                          key={asset.id}
                          className={styles.assetCard}
                          style={{ "--asset-ratio": String(ratio) } as CSSProperties}
                          onClick={() => setActiveAsset(asset)}
                        >
                          <img
                            src={previewUrl}
                            alt={asset.prompt}
                            className={styles.assetImage}
                            loading="lazy"
                            onError={(event) => {
                              const target = event.currentTarget;
                              if (target.dataset.fallbackApplied === "1") {
                                return;
                              }
                              target.dataset.fallbackApplied = "1";
                              target.src = buildFallbackUrl(asset);
                            }}
                          />
                          {asset.toolType === "Video" ? (
                            <span className={styles.videoBadge}>
                              <Video size={12} />
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className={`${styles.favoriteButton} ${
                              isFavorite ? styles.favoriteButtonActive : ""
                            }`}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleFavorite(asset.id);
                            }}
                            aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
                          >
                            <Heart size={14} />
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))
            : null}
        </div>

        <div className={styles.timelineRail}>
          <span className={styles.timelineRailTrack} />
          <span className={styles.timelineRailThumb} style={{ top: `${scrollProgress * 100}%` }} />
        </div>
      </div>

      <aside className={styles.assetsRightPanel}>
        <button type="button" className={styles.rightPanelCollapseBtn} aria-label="Collapse assets panel">
          <span />
          <span />
        </button>

        <div className={styles.searchBox}>
          <Search size={22} />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search assets..."
            aria-label="Search assets"
          />
        </div>

        <div className={styles.filterSection}>
          <button
            type="button"
            className={`${styles.filterPill} ${categoryFilter === "All" ? styles.filterPillActive : ""}`}
            onClick={() => setCategoryFilter("All")}
          >
            <span>All</span>
            <span className={styles.filterCount}>{allCount}</span>
          </button>
          <button
            type="button"
            className={`${styles.filterPill} ${categoryFilter === "Favorites" ? styles.filterPillActive : ""}`}
            onClick={() => setCategoryFilter("Favorites")}
          >
            <span>Favorites</span>
            <span className={styles.filterCount}>{favoritesCount}</span>
          </button>
        </div>

        <div className={styles.toolsSection}>
          <p className={styles.toolsHeading}>Tools</p>
          {toolFilters.map((tool) => {
            const ToolIcon = tool.icon;
            const count =
              tool.label === "Image"
                ? imageCount
                : tool.label === "Video"
                  ? videoCount
                  : 0;
            const active = toolFilter === tool.label;

            return (
              <button
                key={tool.label}
                type="button"
                className={`${styles.toolItem} ${active ? styles.toolItemActive : ""}`}
                onClick={() => setToolFilter(tool.label)}
              >
                <span className={styles.toolLabelWrap}>
                  <ToolIcon size={19} />
                  <span>{tool.label}</span>
                </span>
                <span className={styles.toolCount}>{count}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {activeAsset && (
        <div className={styles.previewOverlay} onClick={() => setActiveAsset(null)}>
          <div className={styles.previewCard} onClick={(event) => event.stopPropagation()}>
            {activeAsset.toolType === "Image" ? (
              <img src={activeAsset.imageUrl} alt={activeAsset.prompt} className={styles.previewImage} />
            ) : (
              <video
                src={activeAsset.videoUrl}
                className={styles.previewVideo}
                poster={activeAsset.previewImageUrl ?? buildFallbackUrl(activeAsset)}
                controls
                preload="metadata"
              />
            )}
            <div className={styles.previewMeta}>
              <p>{activeAsset.prompt}</p>
              <div className={styles.previewChips}>
                <span>{activeAsset.modelAlias}</span>
                <span>{activeAsset.resolutionLabel}</span>
                <span>{activeAsset.frameSizeLabel}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
