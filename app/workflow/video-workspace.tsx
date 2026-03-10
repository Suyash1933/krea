"use client";

import {
  Check,
  ChevronDown,
  Clock3,
  Image as ImageIcon,
  ImagePlus,
  Monitor,
  RectangleHorizontal,
  RectangleVertical,
  Sparkles,
  Star,
  Upload,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./video-workspace.module.css";

type VideoWorkspaceProps = {
  activeSessionId: string | null;
  onSessionChange: (sessionId: string) => void;
  onSessionsRefresh: () => Promise<void> | void;
};

type VideoModelOption = {
  id: string;
  name: string;
  description: string;
  costLabel: string;
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

type VideoGenerateResponse = {
  session?: {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
  };
  generation?: VideoGeneration;
  error?: string;
};

type VideoHistoryGeneration = {
  id: string;
  prompt: string;
  modelAlias: string;
  resolutionLabel: string;
  durationLabel: string;
  createdAt: string;
  videos: Array<{
    id: string;
    videoUrl: string;
    previewImageUrl?: string | null;
    previewImage?: string;
  }>;
};

type SessionHistoryResponse = {
  videoGenerations?: VideoHistoryGeneration[];
  error?: string;
};

type AssetListItem = {
  id: string;
  toolType: "Image" | "Video";
  prompt: string;
  imageUrl?: string;
  videoUrl?: string;
  previewImageUrl?: string | null;
  createdAt: string;
};

type AssetsResponse = {
  assets?: AssetListItem[];
  error?: string;
};

type StartFrameSelection = {
  kind: "upload-image" | "upload-video" | "asset-image" | "asset-video";
  name: string;
  previewUrl: string | null;
};

type PromptPopover = "start-frame" | "resolution" | "duration" | "aspect" | null;
type ModelMenuAnchor = "top" | "chip" | null;
type AspectValue = "Landscape" | "Portrait";

const videoModels: VideoModelOption[] = [
  {
    id: "ltx-2",
    name: "LTX-2",
    description: "Affordable medium-quality audio-video model with native sound generation.",
    costLabel: "~200",
  },
  {
    id: "wan-2-1",
    name: "Wan 2.1",
    description: "Fastest low-quality model with video LoRA support.",
    costLabel: "~250",
  },
  {
    id: "wan-2-2",
    name: "Wan 2.2",
    description: "Fast, lower-quality model from Alibaba.",
    costLabel: "~300",
  },
  {
    id: "wan-2-6",
    name: "Wan 2.6",
    description: "Medium-quality model with improved quality and multi-shot support.",
    costLabel: "~400",
  },
  {
    id: "veo-3-1",
    name: "Veo 3.1",
    description: "Best video model. Highest-quality frontier model with audio and references.",
    costLabel: "~1300",
  },
  {
    id: "kling-o1",
    name: "Kling o1",
    description: "Intelligent video model with image and video references for precise control.",
    costLabel: "~450",
  },
  {
    id: "seedance-1-5-pro",
    name: "Seedance 1.5 Pro",
    description: "Latest medium-quality model with audio generation and end frame support.",
    costLabel: "~400",
  },
  {
    id: "hailuo-2-3-fast",
    name: "Hailuo 2.3 Fast",
    description: "Cheapest medium-quality model. Best for most use cases.",
    costLabel: "~150",
  },
];

const resolutionOptions = ["512p", "768p","1080p"] as const;
const durationOptions = ["5s", "8s", "10s"] as const;
const aspectOptions: Array<{
  id: AspectValue;
  label: AspectValue;
  value: "16:9" | "9:16";
}> = [
  { id: "Landscape", label: "Landscape", value: "16:9" },
  { id: "Portrait", label: "Portrait", value: "9:16" },
];

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

const toVideoGeneration = (generation: VideoHistoryGeneration): VideoGeneration => ({
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
      `https://picsum.photos/seed/video-fallback-${generation.id}-${index}/960/540`,
  })),
});

const truncateLabel = (value: string, maxLength: number) => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};

const getAssetPreview = (asset: AssetListItem) => {
  if (asset.toolType === "Image") {
    return asset.imageUrl ?? null;
  }
  return asset.previewImageUrl ?? null;
};

export default function VideoWorkspace({
  activeSessionId,
  onSessionChange,
  onSessionsRefresh,
}: VideoWorkspaceProps) {
  const startFrameUploadRef = useRef<HTMLInputElement | null>(null);
  const uploadedPreviewUrlRef = useRef<string | null>(null);

  const [selectedModelId, setSelectedModelId] = useState(videoModels[0].id);
  const [modelMenuAnchor, setModelMenuAnchor] = useState<ModelMenuAnchor>(null);
  const [openPopover, setOpenPopover] = useState<PromptPopover>(null);
  const [promptValue, setPromptValue] = useState("");
  const [selectedResolution, setSelectedResolution] = useState<(typeof resolutionOptions)[number]>(
    "512p"
  );
  const [selectedDuration, setSelectedDuration] = useState<(typeof durationOptions)[number]>("5s");
  const [selectedAspect, setSelectedAspect] = useState<AspectValue>("Landscape");
  const [startFrameSelection, setStartFrameSelection] = useState<StartFrameSelection | null>(null);
  const [assetLibrary, setAssetLibrary] = useState<AssetListItem[]>([]);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  const [videoGenerations, setVideoGenerations] = useState<VideoGeneration[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const selectedModel = useMemo(
    () => videoModels.find((model) => model.id === selectedModelId) ?? videoModels[0],
    [selectedModelId]
  );

  const startFrameChipLabel = useMemo(() => {
    if (!startFrameSelection) {
      return "Start frame";
    }
    return truncateLabel(startFrameSelection.name, 18);
  }, [startFrameSelection]);

  useEffect(() => {
    return () => {
      if (uploadedPreviewUrlRef.current) {
        URL.revokeObjectURL(uploadedPreviewUrlRef.current);
      }
    };
  }, []);

  const renderModelDropdown = (anchorClass: string) => (
    <div className={`${styles.modelDropdown} ${anchorClass}`}>
      <p className={styles.modelDropdownTitle}>Click to view all models</p>
      <div className={styles.modelDropdownScroll} role="listbox" aria-label="Video model list">
        {videoModels.map((model) => {
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
                setModelMenuAnchor(null);
              }}
            >
              <div className={styles.modelOptionHead}>
                <span className={styles.modelOptionName}>{model.name}</span>
                {isSelected ? (
                  <Check size={18} className={styles.modelOptionCheck} />
                ) : (
                  <Star size={16} className={styles.modelOptionStar} />
                )}
              </div>
              <p className={styles.modelOptionDescription}>{model.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );

  const loadVideoHistory = useCallback(async (sessionId: string) => {
    setIsHistoryLoading(true);
    setGenerationError(null);

    const response = await fetch(`/api/sessions/${sessionId}`, {
      cache: "no-store",
    });

    const payload = await readJsonSafely<SessionHistoryResponse>(response);

    if (!response.ok) {
      setVideoGenerations([]);
      setIsHistoryLoading(false);
      if (response.status !== 404) {
        setGenerationError(payload?.error ?? "Failed to load video history.");
      }
      return;
    }

    const history = payload?.videoGenerations ?? [];
    setVideoGenerations(history.map(toVideoGeneration).reverse());
    setIsHistoryLoading(false);
  }, []);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadVideoHistory(activeSessionId);
  }, [activeSessionId, loadVideoHistory]);

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

      setAssetLibrary(payload?.assets ?? []);
    };

    void loadAssets();
  }, [isAssetPickerOpen]);

  const visibleGenerations = activeSessionId ? videoGenerations : [];

  const handleGenerate = async () => {
    const trimmedPrompt = promptValue.trim();
    if (!trimmedPrompt) {
      setGenerationError("Prompt is required.");
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);

    const response = await fetch("/api/video/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: activeSessionId ?? undefined,
        prompt: trimmedPrompt,
        modelAlias: selectedModel.name,
        resolutionLabel: selectedResolution,
        durationLabel: selectedDuration,
        startFrameMode: startFrameSelection?.kind ?? "none",
      }),
    });

    const payload = await readJsonSafely<VideoGenerateResponse>(response);

    if (!response.ok || !payload?.generation) {
      setGenerationError(payload?.error ?? `Video generation failed (${response.status}).`);
      setIsGenerating(false);
      return;
    }

    const nextGeneration = payload.generation;
    setVideoGenerations((previous) => [nextGeneration, ...previous]);

    const createdSessionId = payload.session?.id;
    if (createdSessionId && createdSessionId !== activeSessionId) {
      onSessionChange(createdSessionId);
    }

    await onSessionsRefresh();
    setIsGenerating(false);
  };

  const handleDownloadAll = (generation: VideoGeneration) => {
    generation.videos.forEach((video, index) => {
      const anchor = document.createElement("a");
      anchor.href = video.videoUrl;
      anchor.download = `video-${generation.id}-${index + 1}.mp4`;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    });
  };

  const handleOpenStartFrameUpload = () => {
    startFrameUploadRef.current?.click();
  };

  const handleStartFrameUploadChange = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) {
      return;
    }

    if (uploadedPreviewUrlRef.current) {
      URL.revokeObjectURL(uploadedPreviewUrlRef.current);
      uploadedPreviewUrlRef.current = null;
    }

    const previewUrl = URL.createObjectURL(file);
    uploadedPreviewUrlRef.current = previewUrl;

    setStartFrameSelection({
      kind: file.type.startsWith("video/") ? "upload-video" : "upload-image",
      name: file.name,
      previewUrl,
    });
    setOpenPopover(null);
  };

  const handleOpenAssetPicker = () => {
    setIsAssetPickerOpen(true);
  };

  const handleSelectAsset = (asset: AssetListItem) => {
    if (uploadedPreviewUrlRef.current) {
      URL.revokeObjectURL(uploadedPreviewUrlRef.current);
      uploadedPreviewUrlRef.current = null;
    }

    setStartFrameSelection({
      kind: asset.toolType === "Image" ? "asset-image" : "asset-video",
      name: asset.prompt || `${asset.toolType} asset`,
      previewUrl: getAssetPreview(asset),
    });
    setIsAssetPickerOpen(false);
    setOpenPopover(null);
  };

  const renderStartFramePopover = () => (
    <div className={`${styles.featurePopover} ${styles.startFramePopover}`}>
      <p className={styles.featurePopoverText}>
        Start frame anchors the opening of your video. Upload an image/video or select one from your
        assets.
      </p>

      <div className={styles.featureActionStack}>
        <button
          type="button"
          className={`${styles.featureActionButton} ${styles.featureActionButtonPrimary}`}
          onClick={handleOpenStartFrameUpload}
        >
          <Upload size={18} />
          Upload
        </button>
        <button
          type="button"
          className={styles.featureActionButton}
          onClick={handleOpenAssetPicker}
        >
          <ImageIcon size={18} />
          Select asset
        </button>
      </div>

      {startFrameSelection ? (
        <div className={styles.featureSelectionNote}>
          {startFrameSelection.previewUrl ? (
            <span
              className={styles.featureSelectionThumb}
              style={{ backgroundImage: `url(${startFrameSelection.previewUrl})` }}
            />
          ) : (
            <span className={styles.featureSelectionBadge}>
              {startFrameSelection.kind.includes("video") ? "Video" : "Image"}
            </span>
          )}
          <span className={styles.featureSelectionText}>
            {truncateLabel(startFrameSelection.name, 48)}
          </span>
        </div>
      ) : null}
    </div>
  );

  const renderResolutionPopover = () => (
    <div className={styles.selectionPopover}>
      <p className={styles.selectionPopoverTitle}>Resolution</p>
      <div className={styles.selectionOptionList}>
        {resolutionOptions.map((option) => {
          const isSelected = option === selectedResolution;
          return (
            <button
              key={option}
              type="button"
              className={`${styles.selectionOptionButton} ${
                isSelected ? styles.selectionOptionButtonSelected : ""
              }`}
              onClick={() => {
                setSelectedResolution(option);
                setOpenPopover(null);
              }}
            >
              <span>{option}</span>
              <span className={styles.selectionIndicator}>
                {isSelected ? <Check size={16} /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderDurationPopover = () => (
    <div className={styles.selectionPopover}>
      <p className={styles.selectionPopoverTitle}>Duration</p>
      <div className={styles.selectionOptionList}>
        {durationOptions.map((option) => {
          const isSelected = option === selectedDuration;
          return (
            <button
              key={option}
              type="button"
              className={`${styles.selectionOptionButton} ${
                isSelected ? styles.selectionOptionButtonSelected : ""
              }`}
              onClick={() => {
                setSelectedDuration(option);
                setOpenPopover(null);
              }}
            >
              <span>{option}</span>
              <span className={styles.selectionIndicator}>
                {isSelected ? <Check size={16} /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderAspectPopover = () => (
    <div className={`${styles.featurePopover} ${styles.aspectPopover}`}>
      <p className={styles.selectionPopoverTitle}>Aspect Ratio</p>
      <div className={styles.aspectOptionGrid}>
        {aspectOptions.map((option) => {
          const isSelected = option.label === selectedAspect;
          const isLandscape = option.label === "Landscape";
          return (
            <button
              key={option.id}
              type="button"
              className={`${styles.aspectOptionButton} ${
                isSelected ? styles.aspectOptionButtonSelected : ""
              }`}
              onClick={() => {
                setSelectedAspect(option.label);
                setOpenPopover(null);
              }}
            >
              <span
                className={`${styles.aspectOptionShape} ${
                  isLandscape ? styles.aspectOptionShapeLandscape : styles.aspectOptionShapePortrait
                }`}
              />
              <span className={styles.aspectOptionLabel}>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <section className={styles.videoWorkspace}>
      <header className={styles.workspaceTopBar}>
        <div
          className={styles.modelMenuHost}
          onMouseEnter={() => setModelMenuAnchor("top")}
          onMouseLeave={() => setModelMenuAnchor((value) => (value === "top" ? null : value))}
        >
          <button
            type="button"
            className={`${styles.modelButton} ${modelMenuAnchor === "top" ? styles.modelButtonOpen : ""}`}
            onClick={() => setModelMenuAnchor((value) => (value === "top" ? null : "top"))}
            aria-expanded={modelMenuAnchor === "top"}
            aria-haspopup="listbox"
          >
            <span>Model {selectedModel.name}</span>
            <ChevronDown size={20} />
          </button>
          {modelMenuAnchor === "top" ? renderModelDropdown(styles.modelDropdownTop) : null}
        </div>
      </header>

      <div className={styles.workspaceBody}>
        <h1 className={styles.workspaceTitle}>
          <span className={styles.workspaceTitleIcon}>
            <Video size={24} />
          </span>
          Video
        </h1>

        {visibleGenerations.length > 0 ? (
          <div className={styles.generatedHistory}>
            {visibleGenerations.map((generation) => (
              <article key={generation.id} className={styles.generatedRow}>
                <div className={styles.generatedPromptCard}>
                  <p>{generation.prompt}</p>
                  <div className={styles.generatedMetaRail}>
                    <span>{generation.modelAlias}</span>
                    <span>{generation.resolutionLabel}</span>
                    <span>{generation.durationLabel}</span>
                  </div>
                </div>
                <div className={styles.generatedVideosGrid}>
                  {generation.videos.map((video) => (
                    <div key={video.id} className={styles.generatedVideoWrap}>
                      <video
                        src={video.videoUrl}
                        className={styles.generatedVideo}
                        controls
                        preload="metadata"
                        poster={video.previewImage}
                      />
                    </div>
                  ))}
                </div>
                <div className={styles.generatedActionRow}>
                  <button type="button" onClick={() => setPromptValue(generation.prompt)}>
                    Reuse parameters
                  </button>
                  <button type="button" onClick={() => handleDownloadAll(generation)}>
                    Download all
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.generatedPlaceholder}>
            <p>
              {isHistoryLoading
                ? "Loading video history..."
                : activeSessionId
                  ? "No video generations in this session yet."
                  : "Generate your first video clip from text."}
            </p>
          </div>
        )}
      </div>

      <div className={styles.promptDock}>
        <textarea
          className={styles.promptInput}
          placeholder="Describe a video and click generate..."
          value={promptValue}
          onChange={(event) => setPromptValue(event.target.value)}
        />

        <div className={styles.promptActions}>
          <div
            className={styles.modelMenuHost}
            onMouseEnter={() => setModelMenuAnchor("chip")}
            onMouseLeave={() => setModelMenuAnchor((value) => (value === "chip" ? null : value))}
          >
            <button
              type="button"
              className={styles.chipButton}
              onClick={() => setModelMenuAnchor((value) => (value === "chip" ? null : "chip"))}
            >
              <Sparkles size={16} />
              {selectedModel.name}
            </button>
            {modelMenuAnchor === "chip" ? renderModelDropdown(styles.modelDropdownChip) : null}
          </div>

          <div className={styles.chipHost}>
            <button
              type="button"
              className={`${styles.chipButton} ${
                openPopover === "start-frame" || startFrameSelection ? styles.chipButtonActive : ""
              }`}
              onClick={() =>
                setOpenPopover((value) => (value === "start-frame" ? null : "start-frame"))
              }
            >
              <ImagePlus size={16} />
              {startFrameChipLabel}
            </button>
            {openPopover === "start-frame" ? renderStartFramePopover() : null}
          </div>

          <div className={styles.chipHost}>
            <button
              type="button"
              className={`${styles.chipButton} ${
                openPopover === "resolution" ? styles.chipButtonActive : ""
              }`}
              onClick={() =>
                setOpenPopover((value) => (value === "resolution" ? null : "resolution"))
              }
            >
              <Monitor size={16} />
              {selectedResolution}
            </button>
            {openPopover === "resolution" ? renderResolutionPopover() : null}
          </div>

          <div className={styles.chipHost}>
            <button
              type="button"
              className={`${styles.chipButton} ${
                openPopover === "duration" ? styles.chipButtonActive : ""
              }`}
              onClick={() =>
                setOpenPopover((value) => (value === "duration" ? null : "duration"))
              }
            >
              <Clock3 size={16} />
              {selectedDuration}
            </button>
            {openPopover === "duration" ? renderDurationPopover() : null}
          </div>

          <div className={styles.chipHost}>
            <button
              type="button"
              className={`${styles.chipButton} ${
                openPopover === "aspect" ? styles.chipButtonActive : ""
              }`}
              onClick={() => setOpenPopover((value) => (value === "aspect" ? null : "aspect"))}
              aria-label="Aspect ratio"
            >
              {selectedAspect === "Landscape" ? (
                <RectangleHorizontal size={16} />
              ) : (
                <RectangleVertical size={16} />
              )}
              {selectedAspect}
            </button>
            {openPopover === "aspect" ? renderAspectPopover() : null}
          </div>

          <button
            type="button"
            className={styles.generateButton}
            aria-label="Generate video"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? "..." : "+"}
          </button>
        </div>

        {generationError ? <p className={styles.generationError}>{generationError}</p> : null}
      </div>

      {isAssetPickerOpen ? (
        <div className={styles.assetOverlay} onClick={() => setIsAssetPickerOpen(false)}>
          <div className={styles.assetModal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.assetModalHeader}>
              <div>
                <p className={styles.assetModalEyebrow}>Assets</p>
                <h2 className={styles.assetModalTitle}>Select a start frame</h2>
              </div>
              <button
                type="button"
                className={styles.assetModalClose}
                onClick={() => setIsAssetPickerOpen(false)}
                aria-label="Close asset picker"
              >
                <X size={18} />
              </button>
            </div>

            {assetLibrary.length === 0 ? (
              <p className={styles.assetEmptyText}>No assets available yet.</p>
            ) : (
              <div className={styles.assetModalGrid}>
                {assetLibrary.map((asset) => {
                  const previewUrl = getAssetPreview(asset);
                  const isSelected =
                    startFrameSelection?.kind ===
                      (asset.toolType === "Image" ? "asset-image" : "asset-video") &&
                    startFrameSelection.name === (asset.prompt || `${asset.toolType} asset`);

                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className={`${styles.assetCard} ${isSelected ? styles.assetCardSelected : ""}`}
                      onClick={() => handleSelectAsset(asset)}
                    >
                      {previewUrl ? (
                        <img src={previewUrl} alt={asset.prompt} className={styles.assetCardImage} />
                      ) : (
                        <div className={styles.assetCardFallback}>
                          <Video size={18} />
                        </div>
                      )}
                      <div className={styles.assetCardMeta}>
                        <span className={styles.assetCardTitle}>
                          {truncateLabel(asset.prompt || `${asset.toolType} asset`, 46)}
                        </span>
                        <span className={styles.assetCardBadge}>{asset.toolType}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <input
        ref={startFrameUploadRef}
        type="file"
        accept="image/*,video/*"
        className={styles.hiddenInput}
        onChange={(event) => handleStartFrameUploadChange(event.target.files)}
      />
    </section>
  );
}
