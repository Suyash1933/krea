"use client";

import {
  Box,
  Check,
  ChevronDown,
  Download,
  FolderOpen,
  ImagePlus,
  Sparkles,
  X,
} from "lucide-react";
import { useAuth, useClerk } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./three-d-objects-workspace.module.css";

type ThreeDObjectsWorkspaceProps = {
  activeSessionId: string | null;
  onSessionChange: (sessionId: string) => void;
  onSessionsRefresh: () => Promise<void> | void;
};

type ObjectModel = {
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
  filePayload?: UploadedImagePayload;
  assetId?: string;
  assetUrl?: string;
};

type SourceMode = "image-to-3d" | "text-to-3d";

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

type ThreeDGenerateResponse = {
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

const objectModels: ObjectModel[] = [
  {
    id: "hunyuan3d-2-1",
    name: "Hunyuan3D-2.1",
    storedAlias: "3D Objects Hunyuan3D-2.1",
    geminiAlias: "Hunyuan3D-2.1",
    description: "Balanced model for single-object conversion from image or prompt to 3D concepts.",
    costLabel: "~80",
  },
  {
    id: "tripo-2-5",
    name: "Tripo 2.5",
    storedAlias: "3D Objects Tripo 2.5",
    geminiAlias: "Tripo 2.5",
    description: "Fast object generation with good topology and stylized surface cues.",
    costLabel: "~60",
  },
  {
    id: "instantmesh-pro",
    name: "InstantMesh Pro",
    storedAlias: "3D Objects InstantMesh Pro",
    geminiAlias: "InstantMesh Pro",
    description: "Lightweight preview-focused model for quick object blockouts and silhouettes.",
    costLabel: "~40",
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

const truncateText = (value: string, length: number) => {
  if (value.length <= length) {
    return value;
  }

  return `${value.slice(0, Math.max(0, length - 3)).trimEnd()}...`;
};

const isThreeDGeneration = (generation: SessionGeneration) =>
  generation.modelAlias.toLowerCase().startsWith("3d objects ");

const displayModelAlias = (value: string) => value.replace(/^3d objects\s+/i, "");

const toDownloadName = (generationId: string, index: number, mimeType: string) => {
  const extension = mimeType.split("/").pop()?.toLowerCase() || "png";
  return `3d-objects-${generationId}-${index + 1}.${extension}`;
};

export default function ThreeDObjectsWorkspace({
  activeSessionId,
  onSessionChange,
  onSessionsRefresh,
}: ThreeDObjectsWorkspaceProps) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const { isSignedIn } = useAuth();
  const { openSignIn } = useClerk();

  const [selectedModelId, setSelectedModelId] = useState(objectModels[0].id);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  const [isSourceHovered, setIsSourceHovered] = useState(false);
  const [sourceMode, setSourceMode] = useState<SourceMode>("image-to-3d");
  const [meshOnly, setMeshOnly] = useState(false);
  const [sourceImage, setSourceImage] = useState<ImageSelection | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [assetLibrary, setAssetLibrary] = useState<AssetListItem[]>([]);
  const [sessionGenerations, setSessionGenerations] = useState<SessionGeneration[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const selectedModel = useMemo(
    () => objectModels.find((model) => model.id === selectedModelId) ?? objectModels[0],
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
        setGenerationError(payload?.error ?? "Failed to load 3D Objects history.");
      }
      return;
    }

    const generations = (payload?.generations ?? []).filter(isThreeDGeneration);
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

      setSourceImage({
        source: "upload-image",
        name: file.name,
        previewUrl,
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

  const onSelectAsset = (asset: AssetListItem) => {
    if (!asset.imageUrl) {
      return;
    }

    setSourceImage({
      source: "asset-image",
      name: asset.prompt || "Selected image",
      previewUrl: asset.imageUrl,
      assetUrl: asset.imageUrl,
      assetId: asset.id,
    });
    setIsAssetPickerOpen(false);
    setGenerationError(null);
  };

  const clearSourceImage = () => {
    setSourceImage(null);
  };

  const handleGenerate = async () => {
    requireSignIn(async () => {
      const trimmedPrompt = promptValue.trim();

      if (sourceMode === "image-to-3d" && !sourceImage) {
        setGenerationError("Add an image before generating 3D objects.");
        return;
      }

      if (sourceMode === "text-to-3d" && !trimmedPrompt) {
        setGenerationError("Describe the object before generating.");
        return;
      }

      if (isGenerating) {
        return;
      }

      setIsGenerating(true);
      setGenerationError(null);

      try {
        const response = await fetch("/api/three-d-objects/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: activeSessionId ?? undefined,
            prompt: trimmedPrompt || undefined,
            modelAlias: selectedModel.geminiAlias,
            storedModelAlias: selectedModel.storedAlias,
            sourceMode,
            meshOnly,
            sourceImageName: sourceImage?.name,
            sourceImageFile: sourceImage?.filePayload ?? undefined,
            sourceImageAssetUrl: sourceImage?.assetUrl ?? undefined,
          }),
        });

        const payload = await readJsonSafely<ThreeDGenerateResponse>(response);

        if (!response.ok || !payload?.generation) {
          const details =
            typeof payload?.details === "string" && payload.details.trim().length > 0
              ? ` ${payload.details}`
              : "";

          throw new Error(
            payload?.error
              ? `${payload.error}${details}`
              : `3D Objects generation failed (${response.status}).`
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
        const message = error instanceof Error ? error.message : "3D Objects generation failed.";
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
    <section className={styles.threeDWorkspace}>
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
              <div className={styles.modelDropdownScroll} role="listbox" aria-label="3D object models">
                {objectModels.map((model) => {
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
          <div className={styles.heroTitleRow}>
            <span className={styles.heroBadge}>
              <Box size={34} />
            </span>
            <h1 className={styles.heroTitle}>3D Objects</h1>
          </div>

          <section className={styles.composerShell}>
            <div className={styles.composerMain}>
              <div
                className={styles.sourceCard}
                onMouseEnter={() => setIsSourceHovered(true)}
                onMouseLeave={() => setIsSourceHovered(false)}
              >
                {sourceImage ? (
                  <>
                    <img src={sourceImage.previewUrl} alt={sourceImage.name} className={styles.sourcePreview} />
                    <div className={styles.sourcePreviewOverlay}>
                      <span className={styles.sourcePreviewName}>{truncateText(sourceImage.name, 22)}</span>
                      <button
                        type="button"
                        className={styles.clearSelectionButton}
                        onClick={clearSourceImage}
                        aria-label="Clear selected image"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className={styles.sourceEmptyState}>
                    <ImagePlus size={34} />
                    <span>Add image</span>
                  </div>
                )}

                {isSourceHovered ? (
                  <div className={styles.hoverPanel}>
                    <button type="button" className={styles.hoverPrimaryButton} onClick={onUploadClick}>
                      <ImagePlus size={18} />
                      Upload image
                    </button>
                    <button
                      type="button"
                      className={styles.hoverSecondaryButton}
                      onClick={() => requireSignIn(() => setIsAssetPickerOpen(true))}
                    >
                      <FolderOpen size={18} />
                      Select asset
                    </button>
                  </div>
                ) : null}
              </div>

              <div className={styles.flowArrow} aria-hidden="true">
                →
              </div>

              <div className={styles.objectTile}>
                <Box size={38} />
                <span>3D</span>
              </div>

              <div className={styles.promptPanel}>
                <textarea
                  className={styles.promptInput}
                  value={promptValue}
                  onChange={(event) => setPromptValue(event.target.value)}
                  placeholder="Describe the object, materials, silhouette, details, and surface finish..."
                  rows={5}
                />
              </div>

              <button
                type="button"
                className={styles.generateButton}
                onClick={handleGenerate}
                disabled={isGenerating}
                aria-label="Generate 3D object"
              >
                <Sparkles size={24} />
              </button>
            </div>

            <div className={styles.chipRow}>
              <button
                type="button"
                className={`${styles.modeChip} ${sourceMode === "image-to-3d" ? styles.modeChipActive : ""}`}
                onClick={() => setSourceMode("image-to-3d")}
              >
                <ImagePlus size={16} />
                Image to 3D
              </button>
              <button
                type="button"
                className={`${styles.modeChip} ${sourceMode === "text-to-3d" ? styles.modeChipActive : ""}`}
                onClick={() => setSourceMode("text-to-3d")}
              >
                <Sparkles size={16} />
                Text to 3D
              </button>
              <button
                type="button"
                className={`${styles.modeChip} ${meshOnly ? styles.modeChipActive : ""}`}
                onClick={() => setMeshOnly((value) => !value)}
              >
                <Box size={16} />
                Mesh only
              </button>
            </div>
          </section>

          {generationError ? <p className={styles.errorText}>{generationError}</p> : null}

          <section className={styles.historySection}>
            <div className={styles.historyHeader}>
              <h2 className={styles.historyTitle}>3D Object History</h2>
              {isHistoryLoading ? <span className={styles.historyStatus}>Loading...</span> : null}
            </div>

            {sessionGenerations.length === 0 && !isHistoryLoading ? (
              <p className={styles.historyEmpty}>No 3D object generations in this session yet.</p>
            ) : null}

            <div className={styles.historyGrid}>
              {sessionGenerations.map((generation) => {
                const leadImage = generation.images[0];
                return (
                  <article key={generation.id} className={styles.historyCard}>
                    <div className={styles.historyPreview}>
                      {leadImage ? (
                        <img src={leadImage.dataUrl} alt={generation.prompt} className={styles.historyPreviewImage} />
                      ) : null}
                    </div>
                    <div className={styles.historyCardBody}>
                      <div className={styles.historyChipRow}>
                        <span className={styles.historyModelChip}>{displayModelAlias(generation.modelAlias)}</span>
                        {generation.styleTransferName ? (
                          <span className={styles.historyModeChip}>{generation.styleTransferName}</span>
                        ) : null}
                      </div>
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
                <h3 className={styles.assetDialogTitle}>Select source image</h3>
                <p className={styles.assetDialogSubtitle}>Pick an existing image asset for 3D conversion.</p>
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
                  <button key={asset.id} type="button" className={styles.assetCard} onClick={() => onSelectAsset(asset)}>
                    <span
                      className={styles.assetCardPreview}
                      style={{ backgroundImage: asset.imageUrl ? `url(${asset.imageUrl})` : undefined }}
                    />
                    <span className={styles.assetCardTitle}>{truncateText(asset.prompt, 42) || "Image asset"}</span>
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
