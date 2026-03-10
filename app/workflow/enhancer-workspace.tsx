"use client";

import {
  Check,
  ChevronDown,
  Download,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { useAuth, useClerk } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import styles from "./enhancer-workspace.module.css";

type EnhancerWorkspaceProps = {
  activeSessionId: string | null;
  onSessionChange: (sessionId: string) => void;
  onSessionsRefresh: () => Promise<void> | void;
};

type EnhancerModel = {
  id: string;
  name: string;
  description: string;
};

type UploadedImagePayload = {
  name: string;
  mimeType: string;
  data: string;
};

type SessionGeneration = {
  id: string;
  prompt: string;
  modelAlias: string;
  aspectLabel: string;
  frameSizeLabel: string;
  resolutionLabel: string;
  imagePromptName?: string | null;
  styleTransferName?: string | null;
  createdAt: string;
  images: Array<{
    id: string;
    dataUrl: string;
    mimeType: string;
    createdAt: string;
  }>;
};

type SessionHistoryResponse = {
  generations?: SessionGeneration[];
  error?: string;
};

type AssetListItem = {
  id: string;
  toolType: "Image" | "Video";
  imageUrl?: string;
  prompt: string;
  createdAt: string;
};

type AssetsResponse = {
  assets?: AssetListItem[];
  error?: string;
};

type EnhancerGenerateResponse = {
  session?: {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
  };
  generation?: SessionGeneration;
  error?: string;
};

type ResolutionOption = {
  id: string;
  label: "1K" | "1.2K" | "1.5K" | "2K" | "4K";
  maxSide: number;
};

type SourceDimensions = {
  width: number;
  height: number;
};

const enhancerModels: EnhancerModel[] = [
  {
    id: "krea-enhance",
    name: "Krea Enhance",
    description: "Cheap creative enhancer for adding new details. Max 8K.",
  },
  {
    id: "krea-enhance-pro",
    name: "Krea Enhance Pro",
    description: "Sharper detail pass for noisy and soft source images. Max 8K.",
  },
  {
    id: "upscale-v1",
    name: "Upscale V1",
    description: "Cheapest upscaler. Preserves the original input closely. Max 8K.",
  },
  {
    id: "magnific",
    name: "Magnific",
    description: "Best creative enhancer for strong detail invention. Max 10K.",
  },
  {
    id: "magnific-precision",
    name: "Magnific Precision",
    description: "More faithful Magnific variant with restrained detail changes. Max 10K.",
  },
  {
    id: "topaz-photo",
    name: "Topaz Photo",
    description: "Powerful faithful upscaler. Best for photos and clean restoration. Up to 22K.",
  },
  {
    id: "krea-legacy",
    name: "Krea Legacy",
    description: "Krea's older generative enhancer with softer stylization. Max 4K.",
  },
  {
    id: "topaz-video",
    name: "Topaz Video",
    description: "Video-focused detail and denoise model. Good for frames and motion sources. Max 8K.",
  },
  {
    id: "starlight",
    name: "Starlight",
    description: "Diffusion upscaler for more stylized image cleanup and enhancement.",
  },
  {
    id: "clarity-hd",
    name: "Clarity HD",
    description: "Balanced enhancement tuned for portraits, products, and web visuals.",
  },
  {
    id: "studio-clean",
    name: "Studio Clean",
    description: "Faithful cleanup model for graphics, text-heavy visuals, and sharp edges.",
  },
];

const enhancerModelNames = new Set(enhancerModels.map((item) => item.name));
const resolutionOptions: ResolutionOption[] = [
  { id: "res-1k", label: "1K", maxSide: 1024 },
  { id: "res-1-2k", label: "1.2K", maxSide: 1280 },
  { id: "res-1-5k", label: "1.5K", maxSide: 1536 },
  { id: "res-2k", label: "2K", maxSide: 2048 },
  { id: "res-4k", label: "4K", maxSide: 3072 },
];

const INTRO_VIDEO_URL =
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4";
const INTRO_IMAGE_BEFORE =
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1400&q=80";
const INTRO_IMAGE_AFTER =
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=2000&q=92";

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

const fileToBase64 = (file: File) =>
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

const isEnhancerGeneration = (generation: SessionGeneration) => {
  if (enhancerModelNames.has(generation.modelAlias)) {
    return true;
  }
  return generation.modelAlias.toLowerCase().includes("enhance");
};

const toDownloadName = (generationId: string, index: number, mimeType: string) => {
  const extension = mimeType.split("/").pop()?.toLowerCase() || "png";
  return `enhanced-${generationId}-${index + 1}.${extension}`;
};

const truncateText = (value: string, length: number) => {
  if (value.length <= length) {
    return value;
  }
  return `${value.slice(0, Math.max(0, length - 3)).trimEnd()}...`;
};

const ratioToLabel = (ratio: number) => {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return "1:1";
  }

  let bestWidth = 1;
  let bestHeight = 1;
  let bestError = Number.POSITIVE_INFINITY;

  for (let height = 1; height <= 20; height += 1) {
    const width = Math.max(1, Math.round(ratio * height));
    const error = Math.abs(width / height - ratio);
    if (error < bestError) {
      bestError = error;
      bestWidth = width;
      bestHeight = height;
    }
  }

  return `${bestWidth}:${bestHeight}`;
};

const getFrameSizeForResolution = (ratio: number, maxSide: number) => {
  if (ratio >= 1) {
    return {
      width: maxSide,
      height: Math.max(1, Math.round(maxSide / ratio)),
    };
  }

  return {
    width: Math.max(1, Math.round(maxSide * ratio)),
    height: maxSide,
  };
};

export default function EnhancerWorkspace({
  activeSessionId,
  onSessionChange,
  onSessionsRefresh,
}: EnhancerWorkspaceProps) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const { isSignedIn } = useAuth();
  const { openSignIn } = useClerk();

  const [selectedModelId, setSelectedModelId] = useState(enhancerModels[0].id);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [resolution, setResolution] = useState<ResolutionOption["label"]>("2K");
  const [instruction, setInstruction] = useState("");
  const [sourceFile, setSourceFile] = useState<UploadedImagePayload | null>(null);
  const [sourceFileName, setSourceFileName] = useState("");
  const [sourceAssetId, setSourceAssetId] = useState<string | null>(null);
  const [sourceAssetUrl, setSourceAssetUrl] = useState<string | null>(null);
  const [sourceDimensions, setSourceDimensions] = useState<SourceDimensions | null>(null);
  const [assetLibrary, setAssetLibrary] = useState<AssetListItem[]>([]);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  const [sessionGenerations, setSessionGenerations] = useState<SessionGeneration[]>([]);
  const [currentGeneration, setCurrentGeneration] = useState<SessionGeneration | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const selectedModel = useMemo(
    () => enhancerModels.find((model) => model.id === selectedModelId) ?? enhancerModels[0],
    [selectedModelId]
  );

  const selectedResolution = useMemo(
    () => resolutionOptions.find((item) => item.label === resolution) ?? resolutionOptions[3],
    [resolution]
  );

  const selectedSourcePreview = useMemo(() => {
    if (sourceFile) {
      return `data:${sourceFile.mimeType};base64,${sourceFile.data}`;
    }
    return sourceAssetUrl;
  }, [sourceFile, sourceAssetUrl]);

  const selectedSourceName = useMemo(() => {
    if (sourceFileName.trim()) {
      return sourceFileName;
    }
    if (sourceAssetId) {
      return "Selected asset";
    }
    return "Selected image";
  }, [sourceAssetId, sourceFileName]);

  const hasSelectedSource = Boolean(selectedSourcePreview);
  const sourceAspectRatio = useMemo(() => {
    if (!sourceDimensions || sourceDimensions.width <= 0 || sourceDimensions.height <= 0) {
      return 4 / 5;
    }
    return sourceDimensions.width / sourceDimensions.height;
  }, [sourceDimensions]);

  const outputFrameSize = useMemo(
    () => getFrameSizeForResolution(sourceAspectRatio, selectedResolution.maxSide),
    [selectedResolution.maxSide, sourceAspectRatio]
  );

  const outputAspectLabel = useMemo(() => ratioToLabel(sourceAspectRatio), [sourceAspectRatio]);
  const currentResultImage = currentGeneration?.images[0]?.dataUrl ?? null;
  const currentResultCount = currentGeneration?.images.length ?? 0;

  const sessionStatusText = useMemo(() => {
    if (!isSignedIn) {
      return "Sign in to enhance images and load your asset/session history.";
    }

    if (isHistoryLoading) {
      return "Loading enhancer history...";
    }

    if (activeSessionId && sessionGenerations.length > 0) {
      return `${sessionGenerations.length} enhancer result${
        sessionGenerations.length === 1 ? "" : "s"
      } in this session.`;
    }

    if (activeSessionId) {
      return "No enhancer generations in this session yet.";
    }

    return "Upload or choose an image to start enhancing.";
  }, [activeSessionId, isHistoryLoading, isSignedIn, sessionGenerations.length]);

  const requireSignIn = useCallback(
    (callback: () => void) => {
      if (!isSignedIn) {
        void openSignIn();
        return;
      }
      callback();
    },
    [isSignedIn, openSignIn]
  );

  const loadSessionHistory = useCallback(async (sessionId: string) => {
    setIsHistoryLoading(true);
    setGenerationError(null);

    const response = await fetch(`/api/sessions/${sessionId}`, { cache: "no-store" });
    const payload = await readJsonSafely<SessionHistoryResponse>(response);

    if (!response.ok) {
      setSessionGenerations([]);
      setIsHistoryLoading(false);
      if (response.status !== 404) {
        setGenerationError(payload?.error ?? "Failed to load enhancer history.");
      }
      return;
    }

    const generations = (payload?.generations ?? []).filter(isEnhancerGeneration);
    setSessionGenerations(generations.reverse());
    setIsHistoryLoading(false);
  }, []);

  useEffect(() => {
    if (!isSignedIn) {
      setSessionGenerations([]);
      setIsHistoryLoading(false);
      return;
    }

    if (!activeSessionId) {
      setSessionGenerations([]);
      return;
    }

    void loadSessionHistory(activeSessionId);
  }, [activeSessionId, isSignedIn, loadSessionHistory]);

  useEffect(() => {
    if (!selectedSourcePreview) {
      setSourceDimensions(null);
      return;
    }

    let cancelled = false;
    const image = new window.Image();

    image.onload = () => {
      if (cancelled) {
        return;
      }

      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      if (width > 0 && height > 0) {
        setSourceDimensions({ width, height });
      }
    };

    image.onerror = () => {
      if (!cancelled) {
        setSourceDimensions(null);
      }
    };

    image.src = selectedSourcePreview;

    return () => {
      cancelled = true;
    };
  }, [selectedSourcePreview]);

  useEffect(() => {
    if (!isSignedIn) {
      setAssetLibrary([]);
      return;
    }

    if (!isAssetPickerOpen) {
      return;
    }

    const loadAssets = async () => {
      const response = await fetch("/api/assets", { cache: "no-store" });
      const payload = await readJsonSafely<AssetsResponse>(response);

      if (!response.ok) {
        return;
      }

      const imageAssets = (payload?.assets ?? []).filter(
        (asset) => asset.toolType === "Image" && typeof asset.imageUrl === "string"
      );
      setAssetLibrary(imageAssets);
    };

    void loadAssets();
  }, [isAssetPickerOpen, isSignedIn]);

  const onUploadClick = () => {
    requireSignIn(() => {
      uploadInputRef.current?.click();
    });
  };

  const clearSourceSelection = () => {
    setSourceFile(null);
    setSourceFileName("");
    setSourceAssetId(null);
    setSourceAssetUrl(null);
    setSourceDimensions(null);
    setCurrentGeneration(null);
    setGenerationError(null);
    setIsAssetPickerOpen(false);
  };

  const onUploadChange = async (fileList: FileList | null) => {
    if (!isSignedIn) {
      void openSignIn();
      return;
    }

    const file = fileList?.[0];
    if (!file) {
      return;
    }

    try {
      const encodedData = await fileToBase64(file);
      setSourceFile({
        name: file.name,
        mimeType: file.type || "image/png",
        data: encodedData,
      });
      setSourceFileName(file.name);
      setSourceAssetId(null);
      setSourceAssetUrl(null);
      setCurrentGeneration(null);
      setGenerationError(null);
      setIsAssetPickerOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to read image.";
      setGenerationError(message);
    }
  };

  const onSelectAsset = (asset: AssetListItem) => {
    if (!isSignedIn) {
      void openSignIn();
      return;
    }

    setSourceAssetId(asset.id);
    setSourceAssetUrl(asset.imageUrl ?? null);
    setSourceFile(null);
    setSourceFileName(truncateText(asset.prompt || "Asset selected", 40));
    setCurrentGeneration(null);
    setGenerationError(null);
    setIsAssetPickerOpen(false);
  };

  const handleGenerate = async () => {
    if (!isSignedIn) {
      void openSignIn();
      return;
    }

    if (!sourceFile && !sourceAssetUrl) {
      setGenerationError("Upload or select an image first.");
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const response = await fetch("/api/enhancer/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSessionId ?? undefined,
          prompt: instruction.trim() || undefined,
          modelAlias: selectedModel.name,
          resolutionLabel: resolution,
          aspectLabel: outputAspectLabel,
          frameSizeLabel: `${outputFrameSize.width}:${outputFrameSize.height}`,
          sourceImageFile: sourceFile ?? undefined,
          sourceImageAssetUrl: sourceAssetUrl ?? undefined,
        }),
      });

      const payload = await readJsonSafely<EnhancerGenerateResponse>(response);

      if (!response.ok || !payload?.generation) {
        throw new Error(payload?.error ?? `Enhancer generation failed (${response.status}).`);
      }

      const createdSessionId = payload.session?.id;
      const nextGeneration = payload.generation;

      if (createdSessionId && createdSessionId !== activeSessionId) {
        onSessionChange(createdSessionId);
        setSessionGenerations([nextGeneration]);
      } else {
        setSessionGenerations((previous) => [nextGeneration, ...previous]);
      }

      setCurrentGeneration(nextGeneration);
      await onSessionsRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Enhancer generation failed.";
      setGenerationError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOpenAssetPicker = () => {
    requireSignIn(() => {
      setIsAssetPickerOpen(true);
    });
  };

  const handleDownloadAll = (generation: SessionGeneration) => {
    generation.images.forEach((image, index) => {
      const anchor = document.createElement("a");
      anchor.href = image.dataUrl;
      anchor.download = toDownloadName(generation.id, index, image.mimeType);
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    });
  };

  const previewFrameStyle = {
    aspectRatio: sourceDimensions
      ? `${sourceDimensions.width} / ${sourceDimensions.height}`
      : "4 / 5",
  } satisfies CSSProperties;

  return (
    <section className={styles.enhancerWorkspace}>
      <header className={styles.workspaceTopBar}>
        <div
          className={styles.modelMenuHost}
          onMouseEnter={() => setIsModelMenuOpen(true)}
          onMouseLeave={() => setIsModelMenuOpen(false)}
        >
          <button
            type="button"
            className={styles.modelButton}
            onClick={() => setIsModelMenuOpen((value) => !value)}
            aria-expanded={isModelMenuOpen}
            aria-haspopup="listbox"
          >
            <span>Model {selectedModel.name}</span>
            <ChevronDown size={20} />
          </button>
          {isModelMenuOpen ? (
            <div className={styles.modelDropdown}>
              {enhancerModels.map((model) => {
                const isSelected = model.id === selectedModelId;
                return (
                  <button
                    key={model.id}
                    type="button"
                    className={`${styles.modelOption} ${
                      isSelected ? styles.modelOptionSelected : ""
                    }`}
                    onClick={() => {
                      setSelectedModelId(model.id);
                      setIsModelMenuOpen(false);
                    }}
                  >
                    <span>
                      <strong>{model.name}</strong>
                      <small>{model.description}</small>
                    </span>
                    {isSelected ? <Check size={16} /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </header>

      <div className={styles.workspaceStage}>
        {!hasSelectedSource ? (
          <section className={styles.introStage}>
            <article className={styles.introPanel}>
              <div className={styles.introMedia}>
                <video
                  className={styles.introMediaVideo}
                  autoPlay
                  loop
                  muted
                  playsInline
                  aria-hidden="true"
                >
                  <source src={INTRO_VIDEO_URL} type="video/mp4" />
                </video>
                <img src={INTRO_IMAGE_BEFORE} alt="" className={styles.introMediaBase} />
                <img src={INTRO_IMAGE_AFTER} alt="" className={styles.introMediaEnhanced} />
                <span className={styles.introMediaGlow} />
                <span className={styles.introMediaDivider} />
              </div>

              <div className={styles.introPanelBody}>
                <h1 className={styles.panelTitle}>
                  <span className={styles.panelTitleIcon}>
                    <WandSparkles size={32} />
                  </span>
                  Enhancer
                </h1>
                <p className={styles.panelDescription}>
                  Upscale images up to 22K or videos up to 8K resolution, and add new details.
                </p>

                <div className={styles.introActions}>
                  <button type="button" className={styles.primaryActionButton} onClick={onUploadClick}>
                    <Plus size={22} />
                    Upload
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryActionButton}
                    onClick={handleOpenAssetPicker}
                  >
                    <ImageIcon size={22} />
                    Select asset
                  </button>
                </div>

                <p className={styles.helperText}>Max 75MB / 15 seconds</p>
                {generationError ? <p className={styles.generationError}>{generationError}</p> : null}
              </div>
            </article>

            <p className={styles.sessionNote}>{sessionStatusText}</p>
          </section>
        ) : (
          <section className={styles.editorStage}>
            <div className={styles.previewArea}>
              <div className={styles.previewToolbar}>
                <button
                  type="button"
                  className={styles.previewToolbarButton}
                  onClick={clearSourceSelection}
                  aria-label="Back to enhancer home"
                >
                  <X size={18} />
                </button>
                <p className={styles.previewToolbarText}>{selectedSourceName}</p>
              </div>

              <div className={styles.previewCanvas}>
                <div className={styles.previewFrame} style={previewFrameStyle}>
                  {selectedSourcePreview ? (
                    <img
                      src={selectedSourcePreview}
                      alt="Selected source"
                      className={styles.previewImage}
                    />
                  ) : null}
                  {!currentResultImage ? (
                    <div className={styles.previewHint}>
                      <span>Click Enhance to start</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <aside className={styles.settingsPanel}>
              <div className={styles.resultCard}>
                {currentResultImage ? (
                  <img src={currentResultImage} alt="Enhanced preview" className={styles.resultImage} />
                ) : (
                  <div className={styles.resultPlaceholder}>
                    <div
                      className={styles.resultPlaceholderThumb}
                      style={{ backgroundImage: `url(${selectedSourcePreview})` }}
                    />
                    <p className={styles.resultPlaceholderText}>
                      Enhanced preview will appear here after the first run.
                    </p>
                  </div>
                )}
              </div>

              <div className={styles.resolutionRow}>
                {resolutionOptions.map((option) => {
                  const isSelected = option.label === resolution;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`${styles.resolutionChoice} ${
                        isSelected ? styles.resolutionChoiceActive : ""
                      }`}
                      onClick={() => setResolution(option.label)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <div className={styles.settingsBlock}>
                <p className={styles.settingsHeading}>Settings</p>
                <div className={styles.dimensionRow}>
                  <div className={styles.dimensionPill}>
                    <span className={styles.dimensionKey}>W</span>
                    <span>{outputFrameSize.width} px</span>
                  </div>
                  <div className={styles.dimensionPill}>
                    <span className={styles.dimensionKey}>H</span>
                    <span>{outputFrameSize.height} px</span>
                  </div>
                </div>
              </div>

              <div className={styles.settingsBlock}>
                <label htmlFor="enhancer-prompt" className={styles.fieldLabel}>
                  Prompt
                </label>
                <textarea
                  id="enhancer-prompt"
                  className={styles.promptField}
                  placeholder="Optional guidance for the enhance pass..."
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                />
              </div>

              <div className={styles.editorActionRow}>
                <button
                  type="button"
                  className={styles.enhanceActionButton}
                  onClick={handleGenerate}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <LoaderCircle size={20} className={styles.spinnerIcon} />
                  ) : (
                    <WandSparkles size={20} />
                  )}
                  {isGenerating ? "Enhancing..." : "Enhance"}
                </button>
                <button
                  type="button"
                  className={styles.downloadActionButton}
                  onClick={() => currentGeneration && handleDownloadAll(currentGeneration)}
                  disabled={!currentGeneration}
                  aria-label="Download enhanced images"
                >
                  <Download size={20} />
                </button>
              </div>

              <div className={styles.secondarySourceActions}>
                <button type="button" className={styles.sourceSwapButton} onClick={onUploadClick}>
                  <Upload size={14} />
                  Upload new
                </button>
                <button
                  type="button"
                  className={styles.sourceSwapButton}
                  onClick={handleOpenAssetPicker}
                >
                  <ImageIcon size={14} />
                  Select asset
                </button>
              </div>

              <p className={styles.helperText}>
                {currentResultCount > 0
                  ? `${currentResultCount} enhanced variation${
                      currentResultCount === 1 ? "" : "s"
                    } ready to download.`
                  : "Max 75MB / 15 seconds"}
              </p>
              {generationError ? <p className={styles.generationError}>{generationError}</p> : null}
            </aside>
          </section>
        )}
      </div>

      {isAssetPickerOpen ? (
        <div className={styles.assetOverlay} onClick={() => setIsAssetPickerOpen(false)}>
          <div className={styles.assetModal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.assetModalHeader}>
              <div>
                <p className={styles.assetModalEyebrow}>Asset Library</p>
                <h2 className={styles.assetModalTitle}>Select an image asset</h2>
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
              <p className={styles.assetPickerEmpty}>No image assets yet.</p>
            ) : (
              <div className={styles.assetModalGrid}>
                {assetLibrary.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    className={`${styles.assetCard} ${
                      sourceAssetId === asset.id ? styles.assetCardSelected : ""
                    }`}
                    onClick={() => onSelectAsset(asset)}
                  >
                    <img src={asset.imageUrl} alt={asset.prompt} className={styles.assetCardImage} />
                    <span className={styles.assetCardLabel}>{truncateText(asset.prompt, 58)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        className={styles.hiddenInput}
        onChange={(event) => {
          void onUploadChange(event.target.files);
        }}
      />
    </section>
  );
}
