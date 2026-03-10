"use client";

import {
  Check,
  ChevronDown,
  Download,
  FolderOpen,
  PencilRuler,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { useAuth, useClerk } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./edit-workspace.module.css";

type EditWorkspaceProps = {
  activeSessionId: string | null;
  onSessionChange: (sessionId: string) => void;
  onSessionsRefresh: () => Promise<void> | void;
};

type EditModel = {
  id: string;
  name: string;
  storedAlias: string;
  geminiAlias: string;
  description: string;
  costLabel: string;
};

type UploadedImagePayload = {
  name: string;
  mimeType: string;
  data: string;
};

type ImageSelection = {
  source: "upload-image" | "asset-image";
  name: string;
  previewUrl: string;
  width: number;
  height: number;
  filePayload?: UploadedImagePayload;
  assetId?: string;
  assetUrl?: string;
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

type EditGenerateResponse = {
  session?: {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
  };
  generation?: SessionGeneration;
  error?: string;
  details?: string;
};

const editModels: EditModel[] = [
  {
    id: "edit-flux",
    name: "Flux",
    storedAlias: "Edit Flux",
    geminiAlias: "Flux",
    description: "More tools, more control. Define exact regions to change, or expand your image.",
    costLabel: "5",
  },
  {
    id: "edit-nano-banana-2",
    name: "Nano Banana 2",
    storedAlias: "Edit Nano Banana 2",
    geminiAlias: "Nano Banana 2",
    description: "Google's state-of-the-art image editing model.",
    costLabel: "~100",
  },
  {
    id: "edit-nano-banana-pro",
    name: "Nano Banana Pro",
    storedAlias: "Edit Nano Banana Pro",
    geminiAlias: "Nano Banana Pro",
    description: "Higher-control edit model for richer compositing and edge expansion.",
    costLabel: "~100",
  },
  {
    id: "edit-flux-2-klein",
    name: "Flux 2 Klein",
    storedAlias: "Edit Flux 2 Klein",
    geminiAlias: "Flux 2 Klein",
    description: "Fast lightweight Flux 2 model with strong reference-image support.",
    costLabel: "~30",
  },
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

const measureImage = (src: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth || image.width || 1024,
        height: image.naturalHeight || image.height || 1024,
      });
    };
    image.onerror = () => reject(new Error("Unable to read image dimensions."));
    image.src = src;
  });

const truncateText = (value: string, length: number) => {
  if (value.length <= length) {
    return value;
  }

  return `${value.slice(0, Math.max(0, length - 3)).trimEnd()}...`;
};

const gcd = (a: number, b: number): number => {
  let left = Math.abs(a);
  let right = Math.abs(b);

  while (right !== 0) {
    const next = left % right;
    left = right;
    right = next;
  }

  return left || 1;
};

const buildAspectLabel = (width: number, height: number) => {
  const divisor = gcd(width, height);
  return `${Math.max(1, Math.round(width / divisor))}:${Math.max(1, Math.round(height / divisor))}`;
};

const buildFrameSizeLabel = (width: number, height: number, maxSide = 1024) => {
  if (width <= 0 || height <= 0) {
    return "1024:1024";
  }

  if (width >= height) {
    return `${maxSide}:${Math.max(1, Math.round((maxSide * height) / width))}`;
  }

  return `${Math.max(1, Math.round((maxSide * width) / height))}:${maxSide}`;
};

const isEditGeneration = (generation: SessionGeneration) =>
  generation.modelAlias.toLowerCase().startsWith("edit ");

const displayModelAlias = (value: string) => value.replace(/^Edit\s+/i, "");

const toDownloadName = (generationId: string, index: number, mimeType: string) => {
  const extension = mimeType.split("/").pop()?.toLowerCase() || "png";
  return `edit-${generationId}-${index + 1}.${extension}`;
};

export default function EditWorkspace({
  activeSessionId,
  onSessionChange,
  onSessionsRefresh,
}: EditWorkspaceProps) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const { isSignedIn } = useAuth();
  const { openSignIn } = useClerk();

  const [selectedModelId, setSelectedModelId] = useState(editModels[0].id);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  const [sourceImage, setSourceImage] = useState<ImageSelection | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [assetLibrary, setAssetLibrary] = useState<AssetListItem[]>([]);
  const [sessionGenerations, setSessionGenerations] = useState<SessionGeneration[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const selectedModel = useMemo(
    () => editModels.find((model) => model.id === selectedModelId) ?? editModels[0],
    [selectedModelId]
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

  const loadSessionHistory = useCallback(async (sessionId: string) => {
    setIsHistoryLoading(true);
    setGenerationError(null);

    const response = await fetch(`/api/sessions/${sessionId}`, { cache: "no-store" });
    const payload = await readJsonSafely<SessionHistoryResponse>(response);

    if (!response.ok) {
      setSessionGenerations([]);
      setIsHistoryLoading(false);
      if (response.status !== 404) {
        setGenerationError(payload?.error ?? "Failed to load edit history.");
      }
      return;
    }

    const generations = (payload?.generations ?? []).filter(isEditGeneration);
    setSessionGenerations(generations.reverse());
    setIsHistoryLoading(false);
  }, []);

  useEffect(() => {
    if (!activeSessionId) {
      setSessionGenerations([]);
      setIsHistoryLoading(false);
      return;
    }

    void loadSessionHistory(activeSessionId);
  }, [activeSessionId, loadSessionHistory]);

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
          (asset) => asset.toolType === "Image" && typeof asset.imageUrl === "string"
        )
      );
    };

    void loadAssets();
  }, [isAssetPickerOpen]);

  const onUploadClick = () => {
    requireSignIn(() => {
      uploadInputRef.current?.click();
    });
  };

  const onUploadChange = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) {
      return;
    }

    try {
      const data = await fileToBase64(file);
      const mimeType = file.type || "image/png";
      const previewUrl = `data:${mimeType};base64,${data}`;
      const dimensions = await measureImage(previewUrl);

      setSourceImage({
        source: "upload-image",
        name: file.name,
        previewUrl,
        width: dimensions.width,
        height: dimensions.height,
        filePayload: {
          name: file.name,
          mimeType,
          data,
        },
      });
      setGenerationError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to read image.";
      setGenerationError(message);
    }
  };

  const onSelectAsset = async (asset: AssetListItem) => {
    const imageUrl = asset.imageUrl;
    if (!imageUrl) {
      return;
    }

    try {
      const dimensions = await measureImage(imageUrl);
      setSourceImage({
        source: "asset-image",
        name: asset.prompt || "Selected image",
        previewUrl: imageUrl,
        width: dimensions.width,
        height: dimensions.height,
        assetUrl: imageUrl,
        assetId: asset.id,
      });
      setIsAssetPickerOpen(false);
      setGenerationError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to use selected asset.";
      setGenerationError(message);
    }
  };

  const clearSourceImage = () => {
    setSourceImage(null);
  };

  const handleGenerate = async () => {
    requireSignIn(async () => {
      if (!sourceImage) {
        setGenerationError("Upload an image or select an asset first.");
        return;
      }

      if (!promptValue.trim()) {
        setGenerationError("Describe what you want to edit.");
        return;
      }

      if (isGenerating) {
        return;
      }

      setIsGenerating(true);
      setGenerationError(null);

      try {
        const aspectLabel = buildAspectLabel(sourceImage.width, sourceImage.height);
        const frameSizeLabel = buildFrameSizeLabel(sourceImage.width, sourceImage.height);

        const response = await fetch("/api/edit/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: activeSessionId ?? undefined,
            prompt: promptValue.trim(),
            modelAlias: selectedModel.geminiAlias,
            storedModelAlias: selectedModel.storedAlias,
            aspectLabel,
            frameSizeLabel,
            resolutionLabel: "1K",
            sourceImageMode: sourceImage.source,
            sourceImageName: sourceImage.name,
            sourceImageFile: sourceImage.filePayload ?? undefined,
            sourceImageAssetUrl: sourceImage.assetUrl ?? undefined,
          }),
        });

        const payload = await readJsonSafely<EditGenerateResponse>(response);

        if (!response.ok || !payload?.generation) {
          const details =
            typeof payload?.details === "string" && payload.details.trim().length > 0
              ? ` ${payload.details}`
              : "";

          throw new Error(
            payload?.error ? `${payload.error}${details}` : `Edit generation failed (${response.status}).`
          );
        }

        const nextGeneration = payload.generation;
        const createdSessionId = payload.session?.id;

        if (createdSessionId && createdSessionId !== activeSessionId) {
          onSessionChange(createdSessionId);
          setSessionGenerations([nextGeneration]);
        } else {
          setSessionGenerations((previous) => [nextGeneration, ...previous]);
        }

        await onSessionsRefresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Edit generation failed.";
        setGenerationError(message);
      } finally {
        setIsGenerating(false);
      }
    });
  };

  const handleDownloadImage = (generation: SessionGeneration, index: number) => {
    const image = generation.images[index];
    if (!image) {
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = image.dataUrl;
    anchor.download = toDownloadName(generation.id, index, image.mimeType);
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <section className={styles.editWorkspace}>
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
            <span>{isModelMenuOpen ? "Click to view all models" : `Model ${selectedModel.name}`}</span>
            <ChevronDown size={20} />
          </button>
          {isModelMenuOpen ? (
            <div className={styles.modelDropdown}>
              <div className={styles.modelDropdownScroll} role="listbox" aria-label="Edit models">
                {editModels.map((model) => {
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
                      <span className={styles.modelOptionIndicator}>
                        {isSelected ? <Check size={14} /> : <span className={styles.modelOptionCircle} />}
                      </span>
                      <div className={styles.modelOptionBody}>
                        <div className={styles.modelOptionHead}>
                          <span className={styles.modelOptionName}>{model.name}</span>
                          <span className={styles.modelOptionCost}>{model.costLabel}</span>
                        </div>
                        <p className={styles.modelOptionDescription}>{model.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <div className={styles.workspaceBody}>
        <div className={styles.workspaceCenter}>
          <article className={styles.heroCard}>
            {!sourceImage ? (
              <>
                <div className={styles.heroGraphic}>
                  <span className={`${styles.graphicCard} ${styles.graphicCardOne}`} />
                  <span className={`${styles.graphicCard} ${styles.graphicCardTwo}`} />
                  <span className={`${styles.graphicCard} ${styles.graphicCardThree}`} />
                </div>

                <div className={styles.heroTitleRow}>
                  <span className={styles.heroBadge}>
                    <PencilRuler size={34} />
                  </span>
                  <h1 className={styles.heroTitle}>Edit</h1>
                </div>

                <p className={styles.heroDescription}>
                  Rearrange objects in your scene, blend objects from multiple images, place
                  characters, or expand edges.
                </p>

                <div className={styles.heroActions}>
                  <button type="button" className={styles.primaryAction} onClick={onUploadClick}>
                    <Plus size={18} />
                    Upload image
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryAction}
                    onClick={() => requireSignIn(() => setIsAssetPickerOpen(true))}
                  >
                    <FolderOpen size={18} />
                    Select asset
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.editorState}>
                <div className={styles.previewFrame}>
                  <img
                    src={sourceImage.previewUrl}
                    alt={sourceImage.name}
                    className={styles.previewImage}
                  />
                  <button
                    type="button"
                    className={styles.clearSelectionButton}
                    onClick={clearSourceImage}
                    aria-label="Clear selected image"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className={styles.editorBody}>
                  <div className={styles.editorTitleRow}>
                    <span className={styles.heroBadge}>
                      <PencilRuler size={28} />
                    </span>
                    <div className={styles.editorHeading}>
                      <h1 className={styles.heroTitleSmall}>Edit</h1>
                      <p className={styles.sourceName}>{truncateText(sourceImage.name, 48)}</p>
                    </div>
                  </div>

                  <textarea
                    className={styles.promptInput}
                    value={promptValue}
                    onChange={(event) => setPromptValue(event.target.value)}
                    placeholder="Describe what to change, add, remove, blend, or expand..."
                    rows={5}
                  />

                  <div className={styles.editorActions}>
                    <button
                      type="button"
                      className={styles.primaryAction}
                      onClick={handleGenerate}
                      disabled={isGenerating}
                    >
                      {isGenerating ? "Generating..." : "Generate"}
                    </button>
                    <button type="button" className={styles.secondaryAction} onClick={onUploadClick}>
                      <Upload size={18} />
                      Upload image
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryAction}
                      onClick={() => requireSignIn(() => setIsAssetPickerOpen(true))}
                    >
                      <FolderOpen size={18} />
                      Select asset
                    </button>
                  </div>
                </div>
              </div>
            )}
          </article>

          {generationError ? <p className={styles.errorText}>{generationError}</p> : null}

          <section className={styles.historySection}>
            <div className={styles.historyHeader}>
              <h2 className={styles.historyTitle}>Edit History</h2>
              {isHistoryLoading ? <span className={styles.historyStatus}>Loading...</span> : null}
            </div>

            {sessionGenerations.length === 0 && !isHistoryLoading ? (
              <p className={styles.historyEmpty}>No edit generations in this session yet.</p>
            ) : null}

            <div className={styles.historyGrid}>
              {sessionGenerations.map((generation) => {
                const leadImage = generation.images[0];

                return (
                  <article key={generation.id} className={styles.historyCard}>
                    <div className={styles.historyImageWrap}>
                      {leadImage ? (
                        <img
                          src={leadImage.dataUrl}
                          alt={generation.prompt}
                          className={styles.historyImage}
                        />
                      ) : null}
                    </div>
                    <div className={styles.historyCardBody}>
                      <span className={styles.historyModelChip}>
                        {displayModelAlias(generation.modelAlias)}
                      </span>
                      <p className={styles.historyPrompt}>{generation.prompt}</p>
                      <div className={styles.historyMetaRow}>
                        <span className={styles.historyMeta}>{generation.resolutionLabel}</span>
                        <button
                          type="button"
                          className={styles.historyDownloadButton}
                          onClick={() => handleDownloadImage(generation, 0)}
                        >
                          <Download size={16} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        className={styles.hiddenInput}
        onChange={(event) => {
          void onUploadChange(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      {isAssetPickerOpen ? (
        <div className={styles.assetOverlay} onClick={() => setIsAssetPickerOpen(false)}>
          <div className={styles.assetDialog} onClick={(event) => event.stopPropagation()}>
            <div className={styles.assetDialogHeader}>
              <div>
                <h3 className={styles.assetDialogTitle}>Select image asset</h3>
                <p className={styles.assetDialogSubtitle}>Use one of your existing generated images.</p>
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
                <p className={styles.assetEmpty}>No image assets available yet.</p>
              ) : (
                assetLibrary.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    className={styles.assetCard}
                    onClick={() => {
                      void onSelectAsset(asset);
                    }}
                  >
                    <span
                      className={styles.assetCardPreview}
                      style={{
                        backgroundImage: asset.imageUrl ? `url(${asset.imageUrl})` : undefined,
                      }}
                    />
                    <span className={styles.assetCardTitle}>
                      {truncateText(asset.prompt, 44) || "Image asset"}
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
