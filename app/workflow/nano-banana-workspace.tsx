"use client";

import {
  AtSign,
  Check,
  Diamond,
  Download,
  ImagePlus,
  NotebookPen,
  Phone,
  Plus,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useAuth, useClerk } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./nano-banana-workspace.module.css";

type NanoBananaWorkspaceProps = {
  activeSessionId: string | null;
  onSessionChange: (sessionId: string) => void;
  onSessionsRefresh: () => Promise<void> | void;
};

type NanoBananaModel = {
  id: string;
  name: string;
  description: string;
};

type UploadedImagePayload = {
  name: string;
  mimeType: string;
  data: string;
};

type ReferenceImage = {
  id: string;
  source: "upload" | "asset";
  name: string;
  previewUrl: string;
  filePayload?: UploadedImagePayload;
  assetUrl?: string;
  assetId?: string;
};

type AspectOption = {
  id: string;
  label: string;
  width: number;
  height: number;
};

type ResolutionOption = {
  id: string;
  label: "1K" | "2K" | "4K";
  maxSide: number;
  hint: string;
};

type SessionGeneration = {
  id: string;
  prompt: string;
  modelAlias: string;
  aspectLabel: string;
  frameSizeLabel: string;
  resolutionLabel: string;
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

type NanoBananaGenerateResponse = {
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

type PopoverKind = "model" | "images" | "aspect" | "resolution" | "elements" | null;

const nanoBananaModels: NanoBananaModel[] = [
  {
    id: "nano-banana-pro",
    name: "Nano Banana Pro",
    description: "",
  },
  {
    id: "nano-banana-2",
    name: "Nano Banana 2",
    description: "",
  },
];

const nanoBananaModelNames = new Set(nanoBananaModels.map((model) => model.name));

const aspectOptions: AspectOption[] = [
  { id: "1:1", label: "1:1", width: 1, height: 1 },
  { id: "4:3", label: "4:3", width: 4, height: 3 },
  { id: "3:2", label: "3:2", width: 3, height: 2 },
  { id: "16:9", label: "16:9", width: 16, height: 9 },
  { id: "21:9", label: "21:9", width: 21, height: 9 },
  { id: "3:4", label: "3:4", width: 3, height: 4 },
  { id: "2:3", label: "2:3", width: 2, height: 3 },
  { id: "9:16", label: "9:16", width: 9, height: 16 },
  { id: "4:5", label: "4:5", width: 4, height: 5 },
  { id: "5:4", label: "5:4", width: 5, height: 4 },
];

const resolutionOptions: ResolutionOption[] = [
  { id: "1k", label: "1K", maxSide: 1024, hint: "~25s" },
  { id: "2k", label: "2K", maxSide: 2048, hint: "~35s" },
  { id: "4k", label: "4K", maxSide: 3072, hint: "~45s" },
];

const elementSuggestions = [
  "Product",
  "Logo",
  "Typography",
  "Character",
  "Packaging",
  "Brand color",
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

const parseElements = (value: string) => {
  if (!value.trim()) {
    return [];
  }

  const unique = new Set<string>();
  value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => unique.add(entry));

  return Array.from(unique);
};

const getFrameSizeForAspect = (aspect: AspectOption, maxSide: number) => {
  if (aspect.width >= aspect.height) {
    return {
      width: maxSide,
      height: Math.max(1, Math.round((maxSide * aspect.height) / aspect.width)),
    };
  }

  return {
    width: Math.max(1, Math.round((maxSide * aspect.width) / aspect.height)),
    height: maxSide,
  };
};

const isNanoBananaGeneration = (generation: SessionGeneration) => {
  if (nanoBananaModelNames.has(generation.modelAlias)) {
    return true;
  }

  return generation.modelAlias.toLowerCase().includes("nano banana");
};

const toDownloadName = (generationId: string, index: number, mimeType: string) => {
  const extension = mimeType.split("/").pop()?.toLowerCase() || "png";
  return `nano-banana-${generationId}-${index + 1}.${extension}`;
};

export default function NanoBananaWorkspace({
  activeSessionId,
  onSessionChange,
  onSessionsRefresh,
}: NanoBananaWorkspaceProps) {
  const addImagesInputRef = useRef<HTMLInputElement | null>(null);
  const uploadedPreviewUrlsRef = useRef<string[]>([]);
  const { isSignedIn } = useAuth();
  const { openSignIn } = useClerk();

  const [selectedModelId, setSelectedModelId] = useState(nanoBananaModels[0].id);
  const [promptValue, setPromptValue] = useState("");
  const [selectedAspectId, setSelectedAspectId] = useState(aspectOptions[0].id);
  const [selectedResolutionLabel, setSelectedResolutionLabel] =
    useState<ResolutionOption["label"]>("1K");
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [openPopover, setOpenPopover] = useState<PopoverKind>(null);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  const [isContextDrawerOpen, setIsContextDrawerOpen] = useState(false);
  const [isContextEnabled, setIsContextEnabled] = useState(false);
  const [contextValue, setContextValue] = useState("");
  const [elementsValue, setElementsValue] = useState("");
  const [assetLibrary, setAssetLibrary] = useState<AssetListItem[]>([]);
  const [sessionGenerations, setSessionGenerations] = useState<SessionGeneration[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const selectedModel = useMemo(
    () => nanoBananaModels.find((model) => model.id === selectedModelId) ?? nanoBananaModels[0],
    [selectedModelId]
  );

  const selectedAspect = useMemo(
    () => aspectOptions.find((option) => option.id === selectedAspectId) ?? aspectOptions[0],
    [selectedAspectId]
  );

  const selectedResolution = useMemo(
    () =>
      resolutionOptions.find((option) => option.label === selectedResolutionLabel) ??
      resolutionOptions[0],
    [selectedResolutionLabel]
  );

  const parsedElements = useMemo(() => parseElements(elementsValue), [elementsValue]);
  const outputFrameSize = useMemo(
    () => getFrameSizeForAspect(selectedAspect, selectedResolution.maxSide),
    [selectedAspect, selectedResolution.maxSide]
  );

  const imagesChipLabel = useMemo(() => {
    if (referenceImages.length === 0) {
      return "Add images";
    }
    return `${referenceImages.length} image${referenceImages.length === 1 ? "" : "s"}`;
  }, [referenceImages.length]);

  const contextChipLabel = useMemo(() => {
    if (isContextEnabled) {
      return "Context on";
    }
    if (contextValue.trim()) {
      return "Context draft";
    }
    return "Context";
  }, [contextValue, isContextEnabled]);

  const elementsChipLabel = useMemo(() => {
    if (parsedElements.length === 0) {
      return "Elements";
    }
    return `${parsedElements.length} element${parsedElements.length === 1 ? "" : "s"}`;
  }, [parsedElements.length]);

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

  const revokeManagedPreview = useCallback((previewUrl: string) => {
    if (!previewUrl.startsWith("blob:")) {
      return;
    }

    URL.revokeObjectURL(previewUrl);
    uploadedPreviewUrlsRef.current = uploadedPreviewUrlsRef.current.filter(
      (value) => value !== previewUrl
    );
  }, []);

  useEffect(() => {
    return () => {
      uploadedPreviewUrlsRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
      uploadedPreviewUrlsRef.current = [];
    };
  }, []);

  const loadSessionHistory = useCallback(async (sessionId: string) => {
    setIsHistoryLoading(true);
    setGenerationError(null);

    const response = await fetch(`/api/sessions/${sessionId}`, { cache: "no-store" });
    const payload = await readJsonSafely<SessionHistoryResponse>(response);

    if (!response.ok) {
      setSessionGenerations([]);
      setIsHistoryLoading(false);
      if (response.status !== 404) {
        setGenerationError(payload?.error ?? "Failed to load Nano Banana history.");
      }
      return;
    }

    const generations = (payload?.generations ?? []).filter(isNanoBananaGeneration);
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

  const handleAddImagesClick = () => {
    requireSignIn(() => {
      addImagesInputRef.current?.click();
    });
  };

  const handleImageUploads = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) {
      return;
    }

    try {
      const uploadedReferences = await Promise.all(
        files.map(async (file) => {
          const encodedData = await fileToBase64(file);
          const previewUrl = URL.createObjectURL(file);
          uploadedPreviewUrlsRef.current.push(previewUrl);

          return {
            id: crypto.randomUUID(),
            source: "upload" as const,
            name: file.name,
            previewUrl,
            filePayload: {
              name: file.name,
              mimeType: file.type || "image/png",
              data: encodedData,
            },
          };
        })
      );

      setReferenceImages((previous) => {
        const next = [...uploadedReferences, ...previous];
        const trimmed = next.slice(8);
        trimmed.forEach((reference) => revokeManagedPreview(reference.previewUrl));
        return next.slice(0, 8);
      });
      setOpenPopover("images");
      setGenerationError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to read image upload.";
      setGenerationError(message);
    }
  };

  const handleOpenAssetPicker = () => {
    requireSignIn(() => {
      setIsAssetPickerOpen(true);
    });
  };

  const handleSelectAsset = (asset: AssetListItem) => {
    const imageUrl = asset.imageUrl;
    if (!imageUrl) {
      return;
    }

    setReferenceImages((previous) => {
      if (previous.some((item) => item.assetId === asset.id)) {
        return previous;
      }

      const next = [
        {
          id: crypto.randomUUID(),
          source: "asset" as const,
          name: asset.prompt || "Asset image",
          previewUrl: imageUrl,
          assetUrl: imageUrl,
          assetId: asset.id,
        },
        ...previous,
      ];
      const trimmed = next.slice(8);
      trimmed.forEach((reference) => revokeManagedPreview(reference.previewUrl));
      return next.slice(0, 8);
    });
    setIsAssetPickerOpen(false);
    setOpenPopover("images");
  };

  const handleRemoveReference = (referenceId: string) => {
    setReferenceImages((previous) => {
      const next = previous.filter((reference) => reference.id !== referenceId);
      const removed = previous.find((reference) => reference.id === referenceId);
      if (removed) {
        revokeManagedPreview(removed.previewUrl);
      }
      return next;
    });
  };

  const handleAddSuggestion = (suggestion: string) => {
    const existing = parseElements(elementsValue);
    if (existing.includes(suggestion)) {
      return;
    }

    const next = existing.length > 0 ? `${existing.join(", ")}, ${suggestion}` : suggestion;
    setElementsValue(next);
  };

  const handleGenerate = async () => {
    requireSignIn(async () => {
      if (isGenerating) {
        return;
      }

      const trimmedPrompt = promptValue.trim();
      const uploadedFiles = referenceImages
        .filter((reference) => reference.filePayload)
        .map((reference) => reference.filePayload as UploadedImagePayload);
      const assetUrls = referenceImages
        .filter((reference) => reference.assetUrl)
        .map((reference) => reference.assetUrl as string);

      if (
        !trimmedPrompt &&
        uploadedFiles.length === 0 &&
        assetUrls.length === 0 &&
        !contextValue.trim() &&
        parsedElements.length === 0
      ) {
        setGenerationError("Add a prompt, image, context, or element before generating.");
        return;
      }

      setIsGenerating(true);
      setGenerationError(null);

      try {
        const response = await fetch("/api/nano-banana/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: activeSessionId ?? undefined,
            prompt: trimmedPrompt || undefined,
            modelAlias: selectedModel.name,
            aspectLabel: selectedAspect.label,
            frameSizeLabel: `${outputFrameSize.width}:${outputFrameSize.height}`,
            resolutionLabel: selectedResolution.label,
            contextEnabled: isContextEnabled,
            contextText: contextValue.trim() || undefined,
            elements: parsedElements.length > 0 ? parsedElements : undefined,
            referenceFiles: uploadedFiles.length > 0 ? uploadedFiles : undefined,
            referenceAssetUrls: assetUrls.length > 0 ? assetUrls : undefined,
          }),
        });

        const payload = await readJsonSafely<NanoBananaGenerateResponse>(response);

        if (!response.ok || !payload?.generation) {
          const details =
            typeof payload?.details === "string" && payload.details.trim().length > 0
              ? ` ${payload.details}`
              : "";

          throw new Error(
            payload?.error
              ? `${payload.error}${details}`
              : `Nano Banana generation failed (${response.status}).`
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
        const message =
          error instanceof Error ? error.message : "Nano Banana generation failed.";
        setGenerationError(message);
      } finally {
        setIsGenerating(false);
      }
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

  const renderModelPopover = () => (
    <div className={`${styles.popover} ${styles.modelPopover}`}>
      <p className={styles.popoverTitle}>Model</p>
      <div className={styles.modelOptionList} role="listbox" aria-label="Nano Banana model list">
        {nanoBananaModels.map((model) => {
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
                setOpenPopover(null);
              }}
            >
              <span className={styles.modelOptionRadio}>
                {isSelected ? <Check size={14} /> : null}
              </span>
              <span className={styles.modelOptionText}>
                <strong>{model.name}</strong>
                <small>{model.description}</small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderImagesPopover = () => (
    <div className={`${styles.popover} ${styles.imagesPopover}`}>
      <p className={styles.popoverTitle}>Upload images or select from your asset library</p>
      <div className={styles.imagesPopoverActions}>
        <button
          type="button"
          className={`${styles.popoverActionButton} ${styles.popoverActionButtonPrimary}`}
          onClick={handleAddImagesClick}
        >
          <Plus size={18} />
          Upload
        </button>
        <button
          type="button"
          className={styles.popoverActionButton}
          onClick={handleOpenAssetPicker}
        >
          <ImagePlus size={18} />
          Select asset
        </button>
      </div>

      {referenceImages.length > 0 ? (
        <div className={styles.referenceList}>
          {referenceImages.map((reference) => (
            <div key={reference.id} className={styles.referenceCard}>
              <img
                src={reference.previewUrl}
                alt={reference.name}
                className={styles.referenceCardImage}
              />
              <div className={styles.referenceCardMeta}>
                <span className={styles.referenceCardTitle}>
                  {truncateText(reference.name, 28)}
                </span>
                <span className={styles.referenceCardBadge}>{reference.source}</span>
              </div>
              <button
                type="button"
                className={styles.referenceCardRemove}
                onClick={() => handleRemoveReference(reference.id)}
                aria-label={`Remove ${reference.name}`}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  const renderAspectPopover = () => (
    <div className={`${styles.popover} ${styles.aspectPopover}`}>
      <div className={styles.aspectOptionGrid}>
        {aspectOptions.map((option) => {
          const isSelected = option.id === selectedAspectId;
          return (
            <button
              key={option.id}
              type="button"
              className={`${styles.aspectOptionButton} ${
                isSelected ? styles.aspectOptionButtonSelected : ""
              }`}
              onClick={() => {
                setSelectedAspectId(option.id);
                setOpenPopover(null);
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className={styles.aspectPreviewPanel}>
        <div className={styles.aspectPreviewGrid}>
          <div
            className={styles.aspectPreviewFrame}
            style={{ aspectRatio: `${selectedAspect.width} / ${selectedAspect.height}` }}
          />
        </div>
      </div>
    </div>
  );

  const renderResolutionPopover = () => (
    <div className={`${styles.popover} ${styles.resolutionPopover}`}>
      <p className={styles.popoverTitle}>Resolution</p>
      <div className={styles.selectionList}>
        {resolutionOptions.map((option) => {
          const isSelected = option.label === selectedResolution.label;
          return (
            <button
              key={option.id}
              type="button"
              className={`${styles.selectionItem} ${
                isSelected ? styles.selectionItemSelected : ""
              }`}
              onClick={() => {
                setSelectedResolutionLabel(option.label);
                setOpenPopover(null);
              }}
            >
              <span className={styles.selectionItemPrimary}>
                <span className={styles.selectionItemIndicator}>
                  {isSelected ? <Check size={14} /> : null}
                </span>
                {option.label}
              </span>
              <span className={styles.selectionItemHint}>{option.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderElementsPopover = () => (
    <div className={`${styles.popover} ${styles.elementsPopover}`}>
      <p className={styles.popoverTitle}>Elements</p>
      <textarea
        className={styles.elementsTextarea}
        value={elementsValue}
        onChange={(event) => setElementsValue(event.target.value)}
        placeholder="Add reusable elements, @mentions, or scene ingredients..."
      />
      <div className={styles.suggestionRow}>
        {elementSuggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className={styles.suggestionChip}
            onClick={() => handleAddSuggestion(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <section className={styles.nanoBananaWorkspace}>
      <div className={styles.workspaceBody}>
        <div className={styles.workspaceCenter}>
          <header className={styles.workspaceHeader}>
            <h1 className={styles.workspaceTitle}>
              <span className={styles.workspaceTitleIcon}>
                <Phone size={28} />
              </span>
              {selectedModel.name}
            </h1>
          </header>

          {sessionGenerations.length > 0 ? (
            <div className={styles.generatedHistory}>
              {sessionGenerations.map((generation) => (
                <article key={generation.id} className={styles.generatedCard}>
                  <div className={styles.generatedCardHeader}>
                    <div className={styles.generatedCardInfo}>
                      <p className={styles.generatedPrompt}>{generation.prompt}</p>
                      <div className={styles.generatedMetaRail}>
                        <span>{generation.modelAlias}</span>
                        <span>{generation.aspectLabel}</span>
                        <span>{generation.resolutionLabel}</span>
                      </div>
                    </div>
                    <div className={styles.generatedCardActions}>
                      <button
                        type="button"
                        className={styles.generatedActionButton}
                        onClick={() => setPromptValue(generation.prompt)}
                      >
                        Reuse prompt
                      </button>
                      <button
                        type="button"
                        className={styles.generatedActionButton}
                        onClick={() => handleDownloadAll(generation)}
                      >
                        <Download size={16} />
                        Download
                      </button>
                    </div>
                  </div>

                  <div className={styles.generatedImageGrid}>
                    {generation.images.map((image) => (
                      <div key={image.id} className={styles.generatedImageWrap}>
                        <img
                          src={image.dataUrl}
                          alt={generation.prompt}
                          className={styles.generatedImage}
                        />
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.emptyStage}>
              {isHistoryLoading ? (
                <p className={styles.emptyStageText}>Loading Nano Banana history...</p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className={styles.promptDock}>
        <textarea
          className={styles.promptInput}
          placeholder="Ask Nano Banana to generate anything or upload an image to edit it..."
          value={promptValue}
          onChange={(event) => setPromptValue(event.target.value)}
        />

        <div className={styles.promptActions}>
          <div className={styles.chipHost}>
            <button
              type="button"
              className={`${styles.chipButton} ${
                openPopover === "model" ? styles.chipButtonActive : ""
              }`}
              onClick={() => setOpenPopover((value) => (value === "model" ? null : "model"))}
            >
              {selectedModel.name}
            </button>
            {openPopover === "model" ? renderModelPopover() : null}
          </div>

          <div className={styles.chipHost}>
            <button
              type="button"
              className={`${styles.chipButton} ${
                openPopover === "images" || referenceImages.length > 0 ? styles.chipButtonActive : ""
              }`}
              onClick={() => setOpenPopover((value) => (value === "images" ? null : "images"))}
            >
              <Plus size={18} />
              {imagesChipLabel}
            </button>
            {openPopover === "images" ? renderImagesPopover() : null}
          </div>

          <div className={styles.chipHost}>
            <button
              type="button"
              className={`${styles.chipButton} ${
                openPopover === "aspect" || selectedAspectId !== aspectOptions[0].id
                  ? styles.chipButtonActive
                  : ""
              }`}
              onClick={() => setOpenPopover((value) => (value === "aspect" ? null : "aspect"))}
            >
              <Square size={18} />
              {selectedAspect.label}
            </button>
            {openPopover === "aspect" ? renderAspectPopover() : null}
          </div>

          <div className={styles.chipHost}>
            <button
              type="button"
              className={`${styles.chipButton} ${
                openPopover === "resolution" || selectedResolution.label !== resolutionOptions[0].label
                  ? styles.chipButtonActive
                  : ""
              }`}
              onClick={() =>
                setOpenPopover((value) => (value === "resolution" ? null : "resolution"))
              }
            >
              <Diamond size={18} />
              {selectedResolution.label}
            </button>
            {openPopover === "resolution" ? renderResolutionPopover() : null}
          </div>

          <button
            type="button"
            className={`${styles.chipButton} ${
              isContextDrawerOpen || isContextEnabled || contextValue.trim()
                ? styles.chipButtonActive
                : ""
            }`}
            onClick={() => {
              setOpenPopover(null);
              setIsContextDrawerOpen(true);
            }}
          >
            <NotebookPen size={18} />
            {contextChipLabel}
          </button>

          <div className={styles.chipHost}>
            <button
              type="button"
              className={`${styles.chipButton} ${
                openPopover === "elements" || parsedElements.length > 0 ? styles.chipButtonActive : ""
              }`}
              onClick={() => setOpenPopover((value) => (value === "elements" ? null : "elements"))}
            >
              <AtSign size={18} />
              {elementsChipLabel}
            </button>
            {openPopover === "elements" ? renderElementsPopover() : null}
          </div>

          <button
            type="button"
            className={styles.generateButton}
            onClick={handleGenerate}
            disabled={isGenerating}
            aria-label="Generate with Nano Banana"
          >
            {isGenerating ? (
              <Sparkles size={20} className={styles.generateSpinner} />
            ) : (
              <Sparkles size={20} />
            )}
          </button>
        </div>

        {generationError ? <p className={styles.generationError}>{generationError}</p> : null}
      </div>

      {isAssetPickerOpen ? (
        <div className={styles.overlay} onClick={() => setIsAssetPickerOpen(false)}>
          <div className={styles.assetModal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.assetModalHeader}>
              <div>
                <p className={styles.assetModalEyebrow}>Assets</p>
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
              <p className={styles.assetEmptyText}>No image assets available yet.</p>
            ) : (
              <div className={styles.assetGrid}>
                {assetLibrary.map((asset) => {
                  const isSelected = referenceImages.some((item) => item.assetId === asset.id);

                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className={`${styles.assetCard} ${isSelected ? styles.assetCardSelected : ""}`}
                      onClick={() => handleSelectAsset(asset)}
                    >
                      <img
                        src={asset.imageUrl}
                        alt={asset.prompt}
                        className={styles.assetCardImage}
                      />
                      <div className={styles.assetCardMeta}>
                        <span className={styles.assetCardTitle}>
                          {truncateText(asset.prompt || "Asset image", 42)}
                        </span>
                        <span className={styles.assetCardBadge}>Image</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {isContextDrawerOpen ? (
        <div className={styles.contextOverlay} onClick={() => setIsContextDrawerOpen(false)}>
          <aside
            className={styles.contextDrawer}
            onClick={(event) => event.stopPropagation()}
            aria-label="Context editor"
          >
            <button
              type="button"
              className={styles.contextClose}
              onClick={() => setIsContextDrawerOpen(false)}
              aria-label="Close context editor"
            >
              <X size={22} />
            </button>

            <div className={styles.contextSection}>
              <h2 className={styles.contextTitle}>Context Editor</h2>
              <p className={styles.contextDescription}>
                Give Nano Banana context on your project and personal preferences. Paste campaign
                briefs, visual mood boards, or a description of your brand.
              </p>
            </div>

            <div className={styles.contextToggleRow}>
              <span className={styles.contextToggleLabel}>Enable context</span>
              <button
                type="button"
                className={`${styles.contextToggle} ${
                  isContextEnabled ? styles.contextToggleEnabled : ""
                }`}
                aria-pressed={isContextEnabled}
                onClick={() => setIsContextEnabled((value) => !value)}
              >
                <span className={styles.contextToggleKnob} />
              </button>
            </div>

            <div className={styles.contextSection}>
              <label className={styles.contextLabel} htmlFor="nano-banana-context">
                Tell Nano Banana what you want to achieve
              </label>
              <textarea
                id="nano-banana-context"
                className={styles.contextTextarea}
                value={contextValue}
                onChange={(event) => setContextValue(event.target.value)}
                placeholder="Add information, preferences, and instructions. For best results, start a new session with your context..."
              />
            </div>

            <button
              type="button"
              className={styles.contextDoneButton}
              onClick={() => setIsContextDrawerOpen(false)}
            >
              Done
            </button>
          </aside>
        </div>
      ) : null}

      <input
        ref={addImagesInputRef}
        type="file"
        accept="image/*"
        multiple
        className={styles.hiddenInput}
        onChange={(event) => void handleImageUploads(event.target.files)}
      />
    </section>
  );
}
