"use client";

import {
  Check,
  ChevronDown,
  Download,
  Film,
  FolderOpen,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useAuth, useClerk } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./video-restyle-workspace.module.css";

type VideoRestyleWorkspaceProps = {
  activeSessionId: string | null;
  onSessionChange: (sessionId: string) => void;
  onSessionsRefresh: () => Promise<void> | void;
};

type VideoRestyleModel = {
  id: string;
  name: string;
  description: string;
  costLabel: string;
};

type StyleOption = {
  id: string;
  label: string;
  description: string;
};

type UploadedBinaryPayload = {
  name: string;
  mimeType: string;
  data: string;
};

type VideoSelection = {
  source: "upload-video" | "asset-video";
  name: string;
  previewUrl: string;
  filePayload?: UploadedBinaryPayload;
  assetId?: string;
  assetUrl?: string;
  assetPreviewImageUrl?: string | null;
};

type SessionVideoGeneration = {
  id: string;
  prompt: string;
  modelAlias: string;
  resolutionLabel: string;
  durationLabel: string;
  startFrameMode: string | null;
  createdAt: string;
  videos: Array<{
    id: string;
    videoUrl: string;
    previewImageUrl?: string | null;
    previewImage?: string;
  }>;
};

type VideoGeneration = {
  id: string;
  prompt: string;
  modelAlias: string;
  resolutionLabel: string;
  durationLabel: string;
  createdAt: string;
  videos: Array<{
    id: string;
    videoUrl: string;
    previewImage: string;
  }>;
};

type SessionHistoryResponse = {
  videoGenerations?: SessionVideoGeneration[];
  error?: string;
};

type AssetListItem = {
  id: string;
  toolType: "Image" | "Video";
  prompt: string;
  videoUrl?: string;
  previewImageUrl?: string | null;
  createdAt: string;
};

type AssetsResponse = {
  assets?: AssetListItem[];
  error?: string;
};

type VideoRestyleGenerateResponse = {
  session?: {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
  };
  generation?: VideoGeneration;
  error?: string;
  details?: string;
};

const videoRestyleModels: VideoRestyleModel[] = [
  {
    id: "krea",
    name: "Krea",
    description: "Fast stylized restyle model for turning a source video into a new visual look.",
    costLabel: "~120",
  },
  {
    id: "krea-cinema",
    name: "Krea Cinema",
    description: "Higher-fidelity restyle tuned for cinematic video texture and lighting.",
    costLabel: "~180",
  },
  {
    id: "krea-anime",
    name: "Krea Anime",
    description: "Restyle videos into strong illustrated or anime-inspired looks.",
    costLabel: "~150",
  },
];

const styleOptions: StyleOption[] = [
  {
    id: "cinematic",
    label: "Cinematic",
    description: "Rich lighting, filmic contrast, premium color grade.",
  },
  {
    id: "anime",
    label: "Anime",
    description: "Illustrated outlines, vivid palettes, cel-shaded surfaces.",
  },
  {
    id: "noir",
    label: "Film Noir",
    description: "Moody monochrome contrast with dramatic highlights.",
  },
  {
    id: "retro",
    label: "Retro VHS",
    description: "Analog grain, glow, and nostalgic tape-era imperfections.",
  },
  {
    id: "clay",
    label: "Claymation",
    description: "Handcrafted miniature feel with sculpted materials.",
  },
  {
    id: "watercolor",
    label: "Watercolor",
    description: "Painterly washes, soft edges, and pigment bloom.",
  },
];

const videoRestyleModelNames = new Set(videoRestyleModels.map((model) => model.name));

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

const fileToBase64 = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = reader.result;
      if (typeof value !== "string") {
        reject(new Error("Unable to read file."));
        return;
      }

      const base64 = value.split(",")[1];
      if (!base64) {
        reject(new Error("Invalid file encoding."));
        return;
      }

      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });

const truncateText = (value: string, length: number) => {
  if (value.length <= length) {
    return value;
  }

  return `${value.slice(0, Math.max(0, length - 3)).trimEnd()}...`;
};

const isVideoRestyleGeneration = (generation: SessionVideoGeneration) => {
  if (generation.startFrameMode?.startsWith("video-restyle|")) {
    return true;
  }

  if (videoRestyleModelNames.has(generation.modelAlias)) {
    return true;
  }

  return generation.modelAlias.toLowerCase().includes("restyle");
};

const toVideoGeneration = (generation: SessionVideoGeneration): VideoGeneration => ({
  id: generation.id,
  prompt: generation.prompt,
  modelAlias: generation.modelAlias,
  resolutionLabel: generation.resolutionLabel,
  durationLabel: generation.durationLabel,
  createdAt: generation.createdAt,
  videos: generation.videos.map((video, index) => ({
    id: video.id,
    videoUrl: video.videoUrl,
    previewImage:
      video.previewImage ??
      video.previewImageUrl ??
      `https://picsum.photos/seed/video-restyle-${generation.id}-${index}/960/540`,
  })),
});

export default function VideoRestyleWorkspace({
  activeSessionId,
  onSessionChange,
  onSessionsRefresh,
}: VideoRestyleWorkspaceProps) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const styleMenuRef = useRef<HTMLDivElement | null>(null);
  const managedObjectUrlsRef = useRef<string[]>([]);

  const { isSignedIn } = useAuth();
  const { openSignIn } = useClerk();

  const [selectedModelId, setSelectedModelId] = useState(videoRestyleModels[0].id);
  const [selectedStyleId, setSelectedStyleId] = useState(styleOptions[0].id);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isStyleMenuOpen, setIsStyleMenuOpen] = useState(false);
  const [isVideoHovered, setIsVideoHovered] = useState(false);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  const [videoSelection, setVideoSelection] = useState<VideoSelection | null>(null);
  const [prompt, setPrompt] = useState("");
  const [assetLibrary, setAssetLibrary] = useState<AssetListItem[]>([]);
  const [videoGenerations, setVideoGenerations] = useState<VideoGeneration[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const selectedModel = useMemo(
    () => videoRestyleModels.find((model) => model.id === selectedModelId) ?? videoRestyleModels[0],
    [selectedModelId]
  );

  const selectedStyle = useMemo(
    () => styleOptions.find((option) => option.id === selectedStyleId) ?? styleOptions[0],
    [selectedStyleId]
  );

  const requireSignIn = useCallback(
    (callback: () => void | Promise<void>) => {
      if (!isSignedIn) {
        void openSignIn();
        return;
      }

      void callback();
    },
    [isSignedIn, openSignIn]
  );

  const registerObjectUrl = useCallback((value: string) => {
    managedObjectUrlsRef.current.push(value);
  }, []);

  const revokeObjectUrl = useCallback((value: string | null | undefined) => {
    if (!value || !value.startsWith("blob:")) {
      return;
    }

    URL.revokeObjectURL(value);
    managedObjectUrlsRef.current = managedObjectUrlsRef.current.filter((item) => item !== value);
  }, []);

  useEffect(() => {
    return () => {
      managedObjectUrlsRef.current.forEach((value) => {
        if (value.startsWith("blob:")) {
          URL.revokeObjectURL(value);
        }
      });
      managedObjectUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!isStyleMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (styleMenuRef.current?.contains(target)) {
        return;
      }

      setIsStyleMenuOpen(false);
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isStyleMenuOpen]);

  const loadHistory = useCallback(async (sessionId: string) => {
    setIsHistoryLoading(true);
    setGenerationError(null);

    const response = await fetch(`/api/sessions/${sessionId}`, { cache: "no-store" });
    const payload = await readJsonSafely<SessionHistoryResponse>(response);

    if (!response.ok) {
      setVideoGenerations([]);
      setIsHistoryLoading(false);
      if (response.status !== 404) {
        setGenerationError(payload?.error ?? "Failed to load video restyle history.");
      }
      return;
    }

    const generations = (payload?.videoGenerations ?? []).filter(isVideoRestyleGeneration);
    setVideoGenerations(generations.reverse().map(toVideoGeneration));
    setIsHistoryLoading(false);
  }, []);

  useEffect(() => {
    if (!activeSessionId) {
      setVideoGenerations([]);
      setIsHistoryLoading(false);
      return;
    }

    void loadHistory(activeSessionId);
  }, [activeSessionId, loadHistory]);

  useEffect(() => {
    if (!isAssetPickerOpen) {
      return;
    }

    const loadAssets = async () => {
      const response = await fetch("/api/assets", { cache: "no-store" });
      const payload = await readJsonSafely<AssetsResponse>(response);

      if (!response.ok) {
        setGenerationError(payload?.error ?? "Failed to load assets.");
        return;
      }

      setAssetLibrary(
        (payload?.assets ?? []).filter(
          (asset) => asset.toolType === "Video" && typeof asset.videoUrl === "string"
        )
      );
    };

    void loadAssets();
  }, [isAssetPickerOpen]);

  const onVideoUploadClick = () => {
    requireSignIn(() => {
      uploadInputRef.current?.click();
    });
  };

  const onVideoUploadChange = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) {
      return;
    }

    try {
      const data = await fileToBase64(file);
      const previewUrl = URL.createObjectURL(file);
      registerObjectUrl(previewUrl);
      revokeObjectUrl(videoSelection?.previewUrl);

      setVideoSelection({
        source: "upload-video",
        name: file.name,
        previewUrl,
        filePayload: {
          name: file.name,
          mimeType: file.type || "video/mp4",
          data,
        },
      });
      setGenerationError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to read video.";
      setGenerationError(message);
    }
  };

  const onSelectAsset = (asset: AssetListItem) => {
    if (!asset.videoUrl) {
      return;
    }

    revokeObjectUrl(videoSelection?.previewUrl);
    setVideoSelection({
      source: "asset-video",
      name: asset.prompt || "Selected video",
      previewUrl: asset.videoUrl,
      assetUrl: asset.videoUrl,
      assetPreviewImageUrl: asset.previewImageUrl ?? null,
      assetId: asset.id,
    });
    setIsAssetPickerOpen(false);
    setGenerationError(null);
  };

  const clearVideoSelection = () => {
    revokeObjectUrl(videoSelection?.previewUrl);
    setVideoSelection(null);
  };

  const handleGenerate = async () => {
    requireSignIn(async () => {
      if (!videoSelection) {
        setGenerationError("Add a video before generating.");
        return;
      }

      if (!prompt.trim()) {
        setGenerationError("Describe the restyle before generating.");
        return;
      }

      if (isGenerating) {
        return;
      }

      setIsGenerating(true);
      setGenerationError(null);

      try {
        const response = await fetch("/api/video-restyle/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: activeSessionId ?? undefined,
            modelAlias: selectedModel.name,
            prompt: prompt.trim(),
            styleLabel: selectedStyle.label,
            videoSource: videoSelection.source,
            videoName: videoSelection.name,
            videoFile: videoSelection.filePayload ?? undefined,
            videoAssetUrl: videoSelection.assetUrl ?? undefined,
            videoPreviewImageUrl: videoSelection.assetPreviewImageUrl ?? undefined,
          }),
        });

        const payload = await readJsonSafely<VideoRestyleGenerateResponse>(response);

        if (!response.ok || !payload?.generation) {
          const details =
            typeof payload?.details === "string" && payload.details.trim().length > 0
              ? ` ${payload.details}`
              : "";

          throw new Error(
            payload?.error
              ? `${payload.error}${details}`
              : `Video restyle generation failed (${response.status}).`
          );
        }

        const nextGeneration = payload.generation;
        const createdSessionId = payload.session?.id;

        if (createdSessionId && createdSessionId !== activeSessionId) {
          onSessionChange(createdSessionId);
          setVideoGenerations([nextGeneration]);
        } else {
          setVideoGenerations((previous) => [nextGeneration, ...previous]);
        }

        await onSessionsRefresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Video restyle generation failed.";
        setGenerationError(message);
      } finally {
        setIsGenerating(false);
      }
    });
  };

  const handleDownloadVideo = (generation: VideoGeneration, index: number) => {
    const video = generation.videos[index];
    if (!video) {
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = video.videoUrl;
    anchor.download = `video-restyle-${generation.id}-${index + 1}.mp4`;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const renderModelDropdown = () => (
    <div className={styles.modelDropdown}>
      <p className={styles.modelDropdownTitle}>Click to view all models</p>
      <div className={styles.modelDropdownScroll} role="listbox" aria-label="Video restyle models">
        {videoRestyleModels.map((model) => {
          const isSelected = model.id === selectedModelId;

          return (
            <button
              key={model.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              className={`${styles.modelOption} ${isSelected ? styles.modelOptionSelected : ""}`}
              onClick={() => {
                setSelectedModelId(model.id);
                setIsModelMenuOpen(false);
              }}
            >
              <div className={styles.modelOptionHead}>
                <span className={styles.modelOptionName}>{model.name}</span>
                <span className={styles.modelOptionCost}>{model.costLabel}</span>
              </div>
              <p className={styles.modelOptionDescription}>{model.description}</p>
              <span className={styles.modelOptionIndicator}>
                {isSelected ? <Check size={14} /> : <span className={styles.modelOptionCircle} />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderStyleMenu = () => (
    <div className={styles.styleMenu} role="menu">
      {styleOptions.map((option) => {
        const isSelected = option.id === selectedStyleId;

        return (
          <button
            key={option.id}
            type="button"
            className={`${styles.styleOption} ${isSelected ? styles.styleOptionSelected : ""}`}
            onClick={() => {
              setSelectedStyleId(option.id);
              setIsStyleMenuOpen(false);
            }}
          >
            <span className={styles.styleOptionHead}>
              <span>{option.label}</span>
              {isSelected ? <Check size={14} /> : null}
            </span>
            <span className={styles.styleOptionDescription}>{option.description}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <section className={styles.videoRestyleWorkspace}>
      <header className={styles.workspaceTopBar}>
        <div
          className={styles.modelMenuHost}
          onMouseEnter={() => setIsModelMenuOpen(true)}
          onMouseLeave={() => setIsModelMenuOpen(false)}
        >
          <button
            type="button"
            className={`${styles.modelButton} ${isModelMenuOpen ? styles.modelButtonOpen : ""}`}
            onClick={() => setIsModelMenuOpen((value) => !value)}
            aria-expanded={isModelMenuOpen}
            aria-haspopup="listbox"
          >
            <span>Model {selectedModel.name}</span>
            <ChevronDown size={20} />
          </button>
          {isModelMenuOpen ? renderModelDropdown() : null}
        </div>
      </header>

      <div className={styles.workspaceBody}>
        <div className={styles.workspaceCenter}>
          <div className={styles.heroTitleRow}>
            <span className={styles.heroBadge}>
              <Film size={34} />
            </span>
            <h1 className={styles.heroTitle}>Video Restyle</h1>
          </div>

          <div className={styles.composerShell}>
            <div className={styles.composerRow}>
              <div className={styles.videoColumn}>
                <div
                  className={styles.videoDropzone}
                  onMouseEnter={() => setIsVideoHovered(true)}
                  onMouseLeave={() => setIsVideoHovered(false)}
                >
                  {videoSelection ? (
                    <>
                      <video
                        className={styles.selectedVideo}
                        src={videoSelection.previewUrl}
                        poster={videoSelection.assetPreviewImageUrl ?? undefined}
                        muted
                        loop
                        autoPlay
                        playsInline
                      />
                      <div className={styles.selectedVideoOverlay}>
                        <p className={styles.selectedVideoName}>{truncateText(videoSelection.name, 30)}</p>
                        <button
                          type="button"
                          className={styles.clearSelectionButton}
                          onClick={clearVideoSelection}
                          aria-label="Clear selected video"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className={styles.emptyDropzoneContent}>
                      <span className={styles.emptyDropzoneIcon}>
                        <Plus size={30} />
                      </span>
                      <span className={styles.emptyDropzoneLabel}>Add Video</span>
                    </div>
                  )}

                  {isVideoHovered ? (
                    <div className={styles.dropzoneHoverPanel}>
                      <button
                        type="button"
                        className={styles.hoverActionPrimary}
                        onClick={onVideoUploadClick}
                      >
                        <Upload size={18} />
                        Upload file
                      </button>
                      <button
                        type="button"
                        className={styles.hoverActionSecondary}
                        onClick={() => requireSignIn(() => setIsAssetPickerOpen(true))}
                      >
                        <FolderOpen size={18} />
                        Select asset
                      </button>
                    </div>
                  ) : null}
                </div>
                {!videoSelection ? <span className={styles.stepBadge}>Step 1: Add video</span> : null}
              </div>

              <div className={styles.composerArrow} aria-hidden="true">
                →
              </div>

              <div className={styles.promptColumn}>
                <div className={styles.promptCard}>
                  <textarea
                    className={styles.promptInput}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="Describe your video and the visual style you want to apply to it..."
                    rows={4}
                  />
                  <div className={styles.promptFooter}>
                    <div className={styles.styleMenuHost} ref={styleMenuRef}>
                      <button
                        type="button"
                        className={styles.styleChip}
                        onClick={() => setIsStyleMenuOpen((value) => !value)}
                        aria-expanded={isStyleMenuOpen}
                      >
                        <Sparkles size={16} />
                        <span>{selectedStyle.label}</span>
                      </button>
                      {isStyleMenuOpen ? renderStyleMenu() : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.actionColumn}>
                <button
                  type="button"
                  className={styles.generateButton}
                  onClick={handleGenerate}
                  disabled={isGenerating}
                >
                  <Sparkles size={20} />
                  <span>{isGenerating ? "Generating..." : "Generate"}</span>
                </button>
              </div>
            </div>
          </div>

          {generationError ? <p className={styles.errorText}>{generationError}</p> : null}

          <div className={styles.historySection}>
            <div className={styles.historyHeader}>
              <h2 className={styles.historyTitle}>Recent Restyles</h2>
              {isHistoryLoading ? <span className={styles.historyStatus}>Loading...</span> : null}
            </div>

            {videoGenerations.length === 0 && !isHistoryLoading ? (
              <p className={styles.historyEmpty}>No video restyle generations in this session yet.</p>
            ) : null}

            <div className={styles.historyGrid}>
              {videoGenerations.map((generation) => {
                const leadVideo = generation.videos[0];

                return (
                  <article key={generation.id} className={styles.historyCard}>
                    <div
                      className={styles.historyPreview}
                      style={{
                        backgroundImage: leadVideo ? `url(${leadVideo.previewImage})` : undefined,
                      }}
                    >
                      <span className={styles.historyPreviewTag}>{generation.modelAlias}</span>
                    </div>
                    <div className={styles.historyBody}>
                      <p className={styles.historyPrompt}>{generation.prompt}</p>
                      <div className={styles.historyMetaRow}>
                        <span className={styles.historyMeta}>
                          {generation.resolutionLabel} · {generation.durationLabel}
                        </span>
                        <button
                          type="button"
                          className={styles.historyDownloadButton}
                          onClick={() => handleDownloadVideo(generation, 0)}
                        >
                          <Download size={16} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        accept="video/*"
        className={styles.hiddenInput}
        onChange={(event) => {
          void onVideoUploadChange(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      {isAssetPickerOpen ? (
        <div className={styles.assetOverlay} onClick={() => setIsAssetPickerOpen(false)}>
          <div className={styles.assetDialog} onClick={(event) => event.stopPropagation()}>
            <div className={styles.assetDialogHeader}>
              <div>
                <h3 className={styles.assetDialogTitle}>Select video asset</h3>
                <p className={styles.assetDialogSubtitle}>Use one of your previously generated videos.</p>
              </div>
              <button
                type="button"
                className={styles.assetDialogClose}
                onClick={() => setIsAssetPickerOpen(false)}
                aria-label="Close asset picker"
              >
                <X size={18} />
              </button>
            </div>
            <div className={styles.assetGrid}>
              {assetLibrary.length === 0 ? (
                <p className={styles.assetEmpty}>No video assets available yet.</p>
              ) : (
                assetLibrary.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    className={styles.assetCard}
                    onClick={() => onSelectAsset(asset)}
                  >
                    <span
                      className={styles.assetCardPreview}
                      style={{
                        backgroundImage: asset.previewImageUrl
                          ? `url(${asset.previewImageUrl})`
                          : undefined,
                      }}
                    />
                    <span className={styles.assetCardTitle}>
                      {truncateText(asset.prompt, 44) || "Video asset"}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
