"use client";

import {
  Bot,
  Check,
  ChevronDown,
  Gem,
  Image as ImageIcon,
  Link2,
  Mountain,
  Orbit,
  Plus,
  Sparkles,
  Star,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./image-workspace.module.css";

type ImageCard = {
  id: string;
  title: string;
  image: string;
  prompt: string;
  accentClass: string;
};

type ModelOption = {
  id: string;
  name: string;
  description: string;
  icon: "krea" | "nano" | "flux" | "seedream" | "qwen" | "chatgpt" | "recraft" | "zimage";
};

type UploadTarget = "image-prompt" | "style-transfer";

type UploadAsset = {
  id: string;
  title: string;
  image: string;
};

type AspectOption = {
  id: string;
  label: string;
  width: number;
  height: number;
};

type AspectDragHandle = "left" | "right" | "top" | "bottom";

type ResolutionOption = {
  id: string;
  label: string;
  maxSide: number;
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

type ImageWorkspaceProps = {
  activeSessionId: string | null;
  onSessionChange: (sessionId: string) => void;
  onSessionsRefresh: () => Promise<void> | void;
};

const ASPECT_PREVIEW_MIN = 48;
const ASPECT_PREVIEW_MAX = 132;

const cards: ImageCard[] = [
  {
    id: "card-city-character",
    title: "A Highly Stylized Character In City",
    image:
      "https://images.unsplash.com/photo-1503023345310-bd7c1de61c7d?auto=format&fit=crop&w=1200&q=80",
    prompt:
      "A highly stylized character portrait in a cinematic old-city scene, rich detail, moody lighting, premium concept art look.",
    accentClass: styles.cardTiltOne,
  },
  {
    id: "card-roadtrip",
    title: "Postcard For A Vintage Roadtrip",
    image:
      "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80",
    prompt:
      "Postcard for an epic roadtrip through Japan with a title 'Big Roadtrip 2025', illustration style, vibrant travel-poster composition.",
    accentClass: styles.cardTiltTwo,
  },
  {
    id: "card-dark-car",
    title: "Dark Underexposed Sports Car Shot",
    image:
      "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1200&q=80",
    prompt:
      "Dark underexposed sports car beauty shot, dramatic studio shadows, glossy reflections, high-contrast editorial automotive photography.",
    accentClass: styles.cardTiltThree,
  },
  {
    id: "card-surreal-portrait",
    title: "A Surreal Dream Portrait",
    image:
      "https://images.unsplash.com/photo-1500673922987-e212871fec22?auto=format&fit=crop&w=1200&q=80",
    prompt:
      "A surreal dream portrait with cosmic atmosphere, misty glow, deep blue palette, abstract storytelling composition.",
    accentClass: styles.cardTiltFour,
  },
];

const modelOptions: ModelOption[] = [
  {
    id: "krea-1",
    name: "Krea 1",
    description: "Most creative model.",
    icon: "krea",
  },
  {
    id: "nano-banana",
    name: "Nano Banana",
    description: "Most versatile intelligent model.",
    icon: "nano",
  },
  {
    id: "nano-banana-pro",
    name: "Nano Banana Pro",
    description: "World's most intelligent model.",
    icon: "nano",
  },
  {
    id: "nano-banana-2",
    name: "Nano Banana 2",
    description: "World's most intelligent model, now even cheaper.",
    icon: "nano",
  },
  {
    id: "flux-2-klein",
    name: "Flux 2 Klein",
    description: "Fast lightweight Flux 2 model with reference image support.",
    icon: "flux",
  },
  {
    id: "seedream-5-lite",
    name: "Seedream 5 Lite",
    description: "Medium quality model with reasoning and web search.",
    icon: "seedream",
  },
  {
    id: "recraft-v4",
    name: "Recraft V4",
    description: "Sharp, detailed images from Recraft with Standard and Pro modes.",
    icon: "recraft",
  },
  {
    id: "qwen-2512",
    name: "Qwen 2512",
    description: "Affordable medium quality model.",
    icon: "qwen",
  },
  {
    id: "chatgpt-1-5",
    name: "ChatGPT 1.5",
    description: "Very intelligent model. Best for logos.",
    icon: "chatgpt",
  },
  {
    id: "flux",
    name: "Flux",
    description: "Fast model. Best for LoRAs.",
    icon: "flux",
  },
  {
    id: "seedream-4-5",
    name: "Seedream 4.5",
    description: "Medium quality model for photorealism.",
    icon: "seedream",
  },
  {
    id: "z-image",
    name: "Z Image",
    description: "Fastest model. Realistic, low diversity.",
    icon: "zimage",
  },
  {
    id: "flux-2-pro",
    name: "Flux 2 Pro",
    description: "Medium quality model by Black Forest.",
    icon: "flux",
  },
];

const uploadAssets: UploadAsset[] = [
  {
    id: "asset-portrait-1",
    title: "Portrait reference",
    image:
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "asset-fashion-1",
    title: "Fashion lighting",
    image:
      "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "asset-owl-1",
    title: "Owl texture",
    image:
      "https://images.unsplash.com/photo-1518791841217-8f162f1e1131?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "asset-scene-1",
    title: "Night scene",
    image:
      "https://images.unsplash.com/photo-1517705008128-361805f42e86?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "asset-car-1",
    title: "Car style",
    image:
      "https://images.unsplash.com/photo-1494905998402-395d579af36f?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "asset-editorial-1",
    title: "Editorial look",
    image:
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "asset-painting-1",
    title: "Oil painting",
    image:
      "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "asset-illustration-1",
    title: "Illustration",
    image:
      "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "asset-cat-1",
    title: "Character style",
    image:
      "https://images.unsplash.com/photo-1478098711619-5ab0b478d6e6?auto=format&fit=crop&w=600&q=80",
  },
];

const aspectOptions: AspectOption[] = [
  { id: "aspect-4-3", label: "4:3", width: 4, height: 3 },
  { id: "aspect-3-2", label: "3:2", width: 3, height: 2 },
  { id: "aspect-16-9", label: "16:9", width: 16, height: 9 },
  { id: "aspect-2-35-1", label: "2.35:1", width: 2.35, height: 1 },
  { id: "aspect-1-1", label: "1:1", width: 1, height: 1 },
  { id: "aspect-4-5", label: "4:5", width: 4, height: 5 },
  { id: "aspect-2-3", label: "2:3", width: 2, height: 3 },
  { id: "aspect-9-16", label: "9:16", width: 9, height: 16 },
];

const resolutionOptions: ResolutionOption[] = [
  { id: "res-1k", label: "1K", maxSide: 1024 },
  { id: "res-1-2k", label: "1.2K", maxSide: 1280 },
  { id: "res-1-5k", label: "1.5K", maxSide: 1536 },
  { id: "res-4k", label: "4K", maxSide: 4096 },
];
const MAX_POLLINATIONS_SEED = 2_147_483_647;

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const ratioToLabel = (ratio: number) => {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return "1:1";
  }

  const exactMatch = aspectOptions.find(
    (option) => Math.abs(option.width / option.height - ratio) < 0.015
  );
  if (exactMatch) {
    return exactMatch.label;
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

const getFrameFromRatio = (ratio: number) => {
  if (ratio >= 1) {
    return {
      width: ASPECT_PREVIEW_MAX,
      height: clampNumber(ASPECT_PREVIEW_MAX / ratio, ASPECT_PREVIEW_MIN, ASPECT_PREVIEW_MAX),
    };
  }

  return {
    width: clampNumber(ASPECT_PREVIEW_MAX * ratio, ASPECT_PREVIEW_MIN, ASPECT_PREVIEW_MAX),
    height: ASPECT_PREVIEW_MAX,
  };
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

const hashText = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const parseFrameSizeLabel = (frameSizeLabel?: string) => {
  if (!frameSizeLabel) {
    return { width: 1024, height: 1024 };
  }
  const [widthText, heightText] = frameSizeLabel.split(":");
  const width = Number.parseInt(widthText, 10);
  const height = Number.parseInt(heightText, 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 1024, height: 1024 };
  }
  return { width, height };
};

const buildSafeFallbackImageUrl = (
  prompt: string,
  imageId: string,
  frameSizeLabel?: string
) => {
  const { width, height } = parseFrameSizeLabel(frameSizeLabel);
  const seed = hashText(`${prompt}-${imageId}`) % 1_000_000_000;
  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
};

const normalizeDisplayImageUrl = (value: string) => {
  if (!/^https?:\/\//i.test(value)) {
    return value;
  }

  try {
    const url = new URL(value);
    if (!url.hostname.includes("image.pollinations.ai")) {
      return value;
    }

    const seedText = url.searchParams.get("seed");
    if (!seedText) {
      return value;
    }

    const seed = Number(seedText);
    if (!Number.isFinite(seed) || seed <= 0 || seed > MAX_POLLINATIONS_SEED) {
      url.searchParams.set(
        "seed",
        String(Math.floor(Math.random() * MAX_POLLINATIONS_SEED))
      );
    }

    return url.toString();
  } catch {
    return value;
  }
};

const buildDownloadFileName = (
  generationId: string,
  imageIndex: number,
  mimeType: string
) => {
  const extension = mimeType.split("/").pop()?.toLowerCase() || "png";
  return `generation-${generationId}-${imageIndex + 1}.${extension}`;
};

const buildImageProxyUrl = (src: string, fileName: string) => {
  const params = new URLSearchParams({
    src,
    name: fileName,
  });
  return `/api/image-proxy?${params.toString()}`;
};

export default function ImageWorkspace({
  activeSessionId,
  onSessionChange,
  onSessionsRefresh,
}: ImageWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hoverBasePromptRef = useRef("");
  const imagePromptUploadInputRef = useRef<HTMLInputElement | null>(null);
  const styleTransferUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState("krea-1");
  const [promptValue, setPromptValue] = useState("");
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [activeUploadPopover, setActiveUploadPopover] = useState<UploadTarget | null>(null);
  const [imagePromptUploadName, setImagePromptUploadName] = useState("");
  const [styleTransferUploadName, setStyleTransferUploadName] = useState("");
  const [imagePromptUploadFile, setImagePromptUploadFile] =
    useState<UploadedImagePayload | null>(null);
  const [styleTransferUploadFile, setStyleTransferUploadFile] =
    useState<UploadedImagePayload | null>(null);
  const [imagePromptAssetId, setImagePromptAssetId] = useState<string | null>(null);
  const [styleTransferAssetId, setStyleTransferAssetId] = useState<string | null>(null);
  const [isAspectPopoverOpen, setIsAspectPopoverOpen] = useState(false);
  const [isResolutionPopoverOpen, setIsResolutionPopoverOpen] = useState(false);
  const [selectedAspect, setSelectedAspect] = useState("1:1");
  const [selectedResolutionId, setSelectedResolutionId] = useState("res-1k");
  const [aspectFrame, setAspectFrame] = useState(() => getFrameFromRatio(1));
  const [sessionGenerations, setSessionGenerations] = useState<SessionGeneration[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const aspectDragRef = useRef<{
    handle: AspectDragHandle;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    pointerId: number;
  } | null>(null);

  const selectedModel = useMemo(
    () => modelOptions.find((model) => model.id === selectedModelId) ?? modelOptions[0],
    [selectedModelId]
  );

  const selectedResolution = useMemo(
    () =>
      resolutionOptions.find((resolution) => resolution.id === selectedResolutionId) ??
      resolutionOptions[0],
    [selectedResolutionId]
  );

  const imagePromptAssetUrl = useMemo(
    () => uploadAssets.find((asset) => asset.id === imagePromptAssetId)?.image ?? null,
    [imagePromptAssetId]
  );

  const styleTransferAssetUrl = useMemo(
    () => uploadAssets.find((asset) => asset.id === styleTransferAssetId)?.image ?? null,
    [styleTransferAssetId]
  );

  const getModelIcon = (icon: ModelOption["icon"]) => {
    if (icon === "krea") {
      return <Sparkles size={20} />;
    }
    if (icon === "nano") {
      return <Orbit size={20} />;
    }
    if (icon === "flux") {
      return <Mountain size={20} />;
    }
    if (icon === "seedream" || icon === "recraft") {
      return <WandSparkles size={20} />;
    }
    if (icon === "chatgpt" || icon === "qwen" || icon === "zimage") {
      return <Bot size={20} />;
    }
    return <ImageIcon size={20} />;
  };

  const parseAspect = (value: string) => {
    const [widthRaw, heightRaw] = value.split(":");
    const width = Number.parseFloat(widthRaw);
    const height = Number.parseFloat(heightRaw);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }
    return { width, height };
  };
  const selectedAspectRatio = aspectFrame.width / aspectFrame.height;
  const frameSize = useMemo(
    () => getFrameSizeForResolution(selectedAspectRatio, selectedResolution.maxSide),
    [selectedAspectRatio, selectedResolution.maxSide]
  );
  const frameSizeLabel = `${frameSize.width}:${frameSize.height}`;
  const shouldShowRecommendations =
    sessionGenerations.length === 0 && (!activeSessionId || !isHistoryLoading);

  const getAspectIconClass = (ratio: number) => {
    if (Math.abs(ratio - 1) < 0.04) {
      return styles.aspectIconSquare;
    }
    if (ratio > 1) {
      return styles.aspectIconLandscape;
    }
    return styles.aspectIconPortrait;
  };

  const setAspectRatio = (nextAspect: string) => {
    const parsed = parseAspect(nextAspect);
    if (!parsed) {
      return;
    }
    setSelectedAspect(nextAspect);
    setAspectFrame(getFrameFromRatio(parsed.width / parsed.height));
  };

  const getSelectionStatus = (target: UploadTarget) => {
    const fileName = target === "image-prompt" ? imagePromptUploadName : styleTransferUploadName;
    const assetId = target === "image-prompt" ? imagePromptAssetId : styleTransferAssetId;

    if (fileName) {
      return fileName.length > 24 ? `${fileName.slice(0, 21)}...` : fileName;
    }

    if (assetId) {
      const asset = uploadAssets.find((entry) => entry.id === assetId);
      return asset?.title ?? "1 asset selected";
    }

    return "";
  };

  const openUploadPicker = (target: UploadTarget) => {
    if (target === "image-prompt") {
      imagePromptUploadInputRef.current?.click();
      return;
    }
    styleTransferUploadInputRef.current?.click();
  };

  const handleUploadInputChange = async (target: UploadTarget, fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) {
      return;
    }

    const encodedData = await fileToBase64(file);
    const payload: UploadedImagePayload = {
      name: file.name,
      mimeType: file.type || "image/png",
      data: encodedData,
    };

    if (target === "image-prompt") {
      setImagePromptUploadName(file.name);
      setImagePromptUploadFile(payload);
      setImagePromptAssetId(null);
      return;
    }

    setStyleTransferUploadName(file.name);
    setStyleTransferUploadFile(payload);
    setStyleTransferAssetId(null);
  };

  const chooseAsset = (target: UploadTarget, assetId: string) => {
    if (target === "image-prompt") {
      setImagePromptAssetId(assetId);
      setImagePromptUploadName("");
      setImagePromptUploadFile(null);
      return;
    }

    setStyleTransferAssetId(assetId);
    setStyleTransferUploadName("");
    setStyleTransferUploadFile(null);
  };

  const confirmAssetSelection = (target: UploadTarget) => {
    const fallbackAssetId = uploadAssets[0]?.id;
    if (!fallbackAssetId) {
      return;
    }

    if (target === "image-prompt") {
      setImagePromptAssetId((previous) => previous ?? fallbackAssetId);
      setImagePromptUploadName("");
      setImagePromptUploadFile(null);
    } else {
      setStyleTransferAssetId((previous) => previous ?? fallbackAssetId);
      setStyleTransferUploadName("");
      setStyleTransferUploadFile(null);
    }

    setActiveUploadPopover(null);
  };

  useEffect(() => {
    if (!isModelMenuOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }
      if (containerRef.current.contains(event.target as Node)) {
        return;
      }
      setIsModelMenuOpen(false);
    };

    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [isModelMenuOpen]);

  useEffect(() => {
    if (!activeSessionId) {
      setSessionGenerations([]);
      return;
    }

    let cancelled = false;

    const loadHistory = async () => {
      setIsHistoryLoading(true);
      setGenerationError(null);

      try {
        const response = await fetch(`/api/sessions/${activeSessionId}`, {
          cache: "no-store",
        });
        const payload = (await readJsonSafely<{
          error?: string;
          generations?: SessionGeneration[];
        }>(response)) ?? {};
        if (!response.ok) {
          throw new Error(
            payload.error ??
              (response.status ? `Failed to load session history (${response.status}).` : "Failed to load session history.")
          );
        }
        if (!cancelled) {
          setSessionGenerations(payload.generations ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : "Failed to load session history.";
          setGenerationError(message);
        }
      } finally {
        if (!cancelled) {
          setIsHistoryLoading(false);
        }
      }
    };

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [activeSessionId]);

  const handleGenerate = async () => {
    const prompt = promptValue.trim();
    if (!prompt || isGenerating) {
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const requestBody = {
        prompt,
        modelAlias: selectedModel.name,
        aspectLabel: selectedAspect,
        frameSizeLabel,
        resolutionLabel: selectedResolution.label,
        ...(activeSessionId ? { sessionId: activeSessionId } : {}),
        ...(imagePromptUploadFile ? { imagePromptFile: imagePromptUploadFile } : {}),
        ...(styleTransferUploadFile ? { styleTransferFile: styleTransferUploadFile } : {}),
        ...(imagePromptAssetUrl ? { imagePromptAssetUrl } : {}),
        ...(styleTransferAssetUrl ? { styleTransferAssetUrl } : {}),
      };

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const payload = (await readJsonSafely<{
        error?: string;
        details?: string;
        issues?: unknown;
        session?: { id: string };
        generation?: SessionGeneration;
      }>(response)) ?? {};

      if (!response.ok) {
        const details =
          typeof payload.details === "string" && payload.details.trim().length > 0
            ? ` ${payload.details}`
            : "";

        throw new Error(
          (payload.error ? `${payload.error}${details}` : undefined) ??
            (response.status ? `Generation failed (${response.status}).` : "Generation failed.")
        );
      }

      if (!payload.generation) {
        throw new Error("Server returned empty response. Please retry.");
      }
      const nextGeneration = payload.generation;

      if (payload.session?.id && payload.session.id !== activeSessionId) {
        setSessionGenerations([nextGeneration]);
      } else {
        setSessionGenerations((previous) => [...previous, nextGeneration]);
      }

      if (payload.session?.id) {
        onSessionChange(payload.session.id);
      }

      setPromptValue("");
      setHoveredCardId(null);
      setActiveCardId(null);

      await onSessionsRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generation failed.";
      setGenerationError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const onCardMouseEnter = (card: ImageCard) => {
    if (activeCardId) {
      return;
    }
    if (!hoveredCardId) {
      hoverBasePromptRef.current = promptValue;
    }
    setHoveredCardId(card.id);
    setPromptValue(card.prompt);
  };

  const onCardMouseLeave = (card: ImageCard) => {
    if (activeCardId) {
      return;
    }
    if (hoveredCardId !== card.id) {
      return;
    }
    setHoveredCardId(null);
    setPromptValue(hoverBasePromptRef.current);
  };

  const onCardClick = (card: ImageCard) => {
    setActiveCardId(card.id);
    setHoveredCardId(null);
    setPromptValue(card.prompt);
  };

  const updateAspectFromFrame = (width: number, height: number) => {
    const nextWidth = clampNumber(width, ASPECT_PREVIEW_MIN, ASPECT_PREVIEW_MAX);
    const nextHeight = clampNumber(height, ASPECT_PREVIEW_MIN, ASPECT_PREVIEW_MAX);
    setAspectFrame({ width: nextWidth, height: nextHeight });
    setSelectedAspect(ratioToLabel(nextWidth / nextHeight));
  };

  const beginAspectDrag = (handle: AspectDragHandle, event: React.PointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    aspectDragRef.current = {
      handle,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: aspectFrame.width,
      startHeight: aspectFrame.height,
      pointerId: event.pointerId,
    };
  };

  const onAspectDragMove = (event: React.PointerEvent<HTMLSpanElement>) => {
    const drag = aspectDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    let nextWidth = drag.startWidth;
    let nextHeight = drag.startHeight;

    if (drag.handle === "right") {
      nextWidth = drag.startWidth + deltaX;
    } else if (drag.handle === "left") {
      nextWidth = drag.startWidth - deltaX;
    } else if (drag.handle === "bottom") {
      nextHeight = drag.startHeight + deltaY;
    } else if (drag.handle === "top") {
      nextHeight = drag.startHeight - deltaY;
    }

    updateAspectFromFrame(nextWidth, nextHeight);
  };

  const endAspectDrag = (event: React.PointerEvent<HTMLSpanElement>) => {
    const drag = aspectDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    aspectDragRef.current = null;
  };

  const renderUploadPopover = (target: UploadTarget, description: string, alignRight = false) => {
    const isOpen = activeUploadPopover === target;
    const isStyleTransfer = target === "style-transfer";
    const selectedAssetId = target === "image-prompt" ? imagePromptAssetId : styleTransferAssetId;
    const selectionStatus = getSelectionStatus(target);
    const showRecommendations = isStyleTransfer;

    return (
      <div
        className={`${styles.uploadPopover} ${
          alignRight ? styles.uploadPopoverAlignRight : ""
        } ${isStyleTransfer ? styles.styleTransferPopover : ""} ${
          isOpen ? styles.uploadPopoverOpen : ""
        }`}
      >
        {!isStyleTransfer && <p className={styles.uploadPopoverCopy}>{description}</p>}

        {showRecommendations && (
          <div className={styles.uploadAssetGrid}>
            {uploadAssets.map((asset) => (
              <button
                key={`${target}-${asset.id}`}
                type="button"
                className={`${styles.uploadAssetButton} ${
                  selectedAssetId === asset.id ? styles.uploadAssetButtonSelected : ""
                }`}
                onClick={() => chooseAsset(target, asset.id)}
              >
                <span
                  className={styles.uploadAssetThumb}
                  style={{ backgroundImage: `url(${asset.image})` }}
                  aria-label={asset.title}
                />
              </button>
            ))}
          </div>
        )}

        <div className={styles.uploadActions}>
          <button
            type="button"
            className={styles.uploadPrimaryButton}
            onClick={() => openUploadPicker(target)}
          >
            <span className={styles.uploadPrimaryIcon}>
              <Plus size={14} />
            </span>
            Upload
          </button>
          <button
            type="button"
            className={styles.uploadSecondaryButton}
            onClick={() => confirmAssetSelection(target)}
          >
            <ImageIcon size={16} />
            Select asset
          </button>
          {selectionStatus && <p className={styles.uploadSelectionStatus}>{selectionStatus}</p>}
        </div>
      </div>
    );
  };

  const renderAspectRatioPopover = () => {
    return (
      <div className={`${styles.aspectPopover} ${isAspectPopoverOpen ? styles.aspectPopoverOpen : ""}`}>
        <div className={styles.aspectOptionsColumn}>
          <div className={styles.aspectOptionsGrid}>
            {aspectOptions.map((option) => {
              const isSelected = option.label === selectedAspect;
              const ratio = option.width / option.height;
              const maxSize = 56;
              const shapeWidth = ratio >= 1 ? maxSize : Math.max(24, maxSize * ratio);
              const shapeHeight = ratio >= 1 ? Math.max(24, maxSize / ratio) : maxSize;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`${styles.aspectOptionButton} ${
                    isSelected ? styles.aspectOptionButtonSelected : ""
                  }`}
                  onClick={() => setAspectRatio(option.label)}
                >
                  <span
                    className={styles.aspectOptionShape}
                    style={{ width: `${shapeWidth}px`, height: `${shapeHeight}px` }}
                  >
                    <span>{option.label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.aspectPreviewColumn}>
          <div
            className={styles.aspectPreviewFrame}
            style={{
              width: `${aspectFrame.width}px`,
              height: `${aspectFrame.height}px`,
            }}
          >
            <span
              className={`${styles.aspectHandleTop} ${styles.aspectHandleInteractive}`}
              onPointerDown={(event) => beginAspectDrag("top", event)}
              onPointerMove={onAspectDragMove}
              onPointerUp={endAspectDrag}
              onPointerCancel={endAspectDrag}
            />
            <span
              className={`${styles.aspectHandleBottom} ${styles.aspectHandleInteractive}`}
              onPointerDown={(event) => beginAspectDrag("bottom", event)}
              onPointerMove={onAspectDragMove}
              onPointerUp={endAspectDrag}
              onPointerCancel={endAspectDrag}
            />
            <span
              className={`${styles.aspectHandleLeft} ${styles.aspectHandleInteractive}`}
              onPointerDown={(event) => beginAspectDrag("left", event)}
              onPointerMove={onAspectDragMove}
              onPointerUp={endAspectDrag}
              onPointerCancel={endAspectDrag}
            />
            <span
              className={`${styles.aspectHandleRight} ${styles.aspectHandleInteractive}`}
              onPointerDown={(event) => beginAspectDrag("right", event)}
              onPointerMove={onAspectDragMove}
              onPointerUp={endAspectDrag}
              onPointerCancel={endAspectDrag}
            />
            <span className={`${styles.aspectPreviewLine} ${styles.aspectPreviewLineVerticalOne}`} />
            <span className={`${styles.aspectPreviewLine} ${styles.aspectPreviewLineVerticalTwo}`} />
            <span className={`${styles.aspectPreviewLine} ${styles.aspectPreviewLineHorizontalOne}`} />
            <span className={`${styles.aspectPreviewLine} ${styles.aspectPreviewLineHorizontalTwo}`} />
          </div>
        </div>
      </div>
    );
  };

  const renderResolutionPopover = () => {
    return (
      <div
        className={`${styles.resolutionPopover} ${
          isResolutionPopoverOpen ? styles.resolutionPopoverOpen : ""
        }`}
      >
        <p className={styles.resolutionTitle}>Resolution</p>
        <div className={styles.resolutionOptionList}>
          {resolutionOptions.map((option) => {
            const isSelected = option.id === selectedResolutionId;
            return (
              <button
                key={option.id}
                type="button"
                className={`${styles.resolutionOptionButton} ${
                  isSelected ? styles.resolutionOptionButtonSelected : ""
                }`}
                onClick={() => {
                  setSelectedResolutionId(option.id);
                  setIsResolutionPopoverOpen(false);
                }}
              >
                <span className={styles.resolutionOptionDot}>
                  {isSelected && <span className={styles.resolutionOptionDotInner} />}
                </span>
                <span className={styles.resolutionOptionValue}>{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const handleRetryGeneration = (generation: SessionGeneration) => {
    setPromptValue(generation.prompt);
  };

  const handleReuseParameters = (generation: SessionGeneration) => {
    setPromptValue(generation.prompt);

    const matchedModel = modelOptions.find((model) => model.name === generation.modelAlias);
    if (matchedModel) {
      setSelectedModelId(matchedModel.id);
    }

    const matchedResolution = resolutionOptions.find(
      (resolution) => resolution.label === generation.resolutionLabel
    );
    if (matchedResolution) {
      setSelectedResolutionId(matchedResolution.id);
    }

    if (generation.aspectLabel) {
      const parsed = parseAspect(generation.aspectLabel);
      if (parsed) {
        setAspectRatio(generation.aspectLabel);
      }
    }
  };

  const handleDownloadAll = (generation: SessionGeneration) => {
    generation.images.forEach((image, index) => {
      const normalizedUrl = normalizeDisplayImageUrl(image.dataUrl);
      const fileName = buildDownloadFileName(generation.id, index, image.mimeType);
      const isRemoteUrl = /^https?:\/\//i.test(normalizedUrl);

      const anchor = document.createElement("a");
      anchor.href = isRemoteUrl
        ? buildImageProxyUrl(normalizedUrl, fileName)
        : normalizedUrl;
      anchor.download = fileName;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    });
  };

  const handleDeleteGeneration = (generationId: string) => {
    setSessionGenerations((previous) =>
      previous.filter((generation) => generation.id !== generationId)
    );
  };

  return (
    <section ref={containerRef} className={styles.imageWorkspace}>
      <header className={styles.workspaceTopBar} onMouseLeave={() => setIsModelMenuOpen(false)}>
        <button
          type="button"
          className={`${styles.modelButton} ${isModelMenuOpen ? styles.modelButtonOpen : ""}`}
          aria-expanded={isModelMenuOpen}
          aria-haspopup="listbox"
          onMouseEnter={() => setIsModelMenuOpen(true)}
          onClick={() => setIsModelMenuOpen((value) => !value)}
        >
          <span>Model {selectedModel.name}</span>
            
          <ChevronDown size={18} />
        </button>

        {isModelMenuOpen && (
          <div className={styles.modelDropdown}>
            <div className={styles.modelDropdownScroll} role="listbox" aria-label="Model List">
              {modelOptions.map((model) => {
                const isSelected = model.id === selectedModelId;
                return (
                  <button
                    key={model.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`${styles.modelOption} ${
                      isSelected ? styles.modelOptionSelected : ""
                    }`}
                    onClick={() => {
                      setSelectedModelId(model.id);
                      setIsModelMenuOpen(false);
                    }}
                  >
                    <div className={styles.modelOptionMain}>
                      <span className={styles.modelOptionIcon}>{getModelIcon(model.icon)}</span>
                      <span className={styles.modelOptionBody}>
                        <span className={styles.modelOptionName}>{model.name}</span>
                        <span className={styles.modelOptionDescription}>{model.description}</span>
                      </span>
                      {isSelected ? (
                        <Check size={24} className={styles.modelOptionCheck} />
                      ) : (
                        <Star size={20} className={styles.modelOptionStar} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {shouldShowRecommendations ? (
        <div className={styles.workspaceHero}>
          <h1 className={styles.workspaceTitle}>
            <span className={styles.workspaceTitleIcon}>
              <ImageIcon size={24} />
            </span>
            Image
          </h1>

          <div className={styles.cardRow}>
            {cards.map((card) => (
              <article
                key={card.title}
                className={`${styles.promptCard} ${card.accentClass} ${
                  activeCardId === card.id ? styles.promptCardActive : ""
                }`}
                style={{ backgroundImage: `url(${card.image})` }}
                onMouseEnter={() => onCardMouseEnter(card)}
                onMouseLeave={() => onCardMouseLeave(card)}
                onClick={() => onCardClick(card)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onCardClick(card);
                  }
                }}
              >
                <div className={styles.promptCardOverlay} />
                <h3>{card.title}</h3>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className={styles.generatedHistory}>
        {isHistoryLoading && <p className={styles.generatedInfoText}>Loading history...</p>}
        {!isHistoryLoading && sessionGenerations.length === 0 && (
          <p className={styles.generatedInfoText}>
            {activeSessionId ? "No generations in this session yet." : "Start by generating your first image."}
          </p>
        )}

        {sessionGenerations.map((generation) => (
          <article key={generation.id} className={styles.generatedRow}>
            <div className={styles.generatedPromptColumn}>
              <div className={styles.generatedPromptCard}>
                <p className={styles.generatedPromptText}>{generation.prompt}</p>
              </div>
              <div className={styles.generatedMetaRail}>
                <span className={styles.generatedMetaChip}>{generation.resolutionLabel}</span>
                <span className={styles.generatedMetaChip}>{generation.modelAlias}</span>
              </div>
            </div>
            <div className={styles.generatedResultColumn}>
              <div className={styles.generatedGrid}>
                {generation.images.map((image) => (
                  <div key={image.id} className={styles.generatedImageWrap}>
                    <img
                      src={normalizeDisplayImageUrl(image.dataUrl)}
                      alt={generation.prompt}
                      className={styles.generatedImage}
                      loading="lazy"
                      onError={(event) => {
                        const target = event.currentTarget;
                        if (target.dataset.fallbackApplied === "1") {
                          return;
                        }
                        target.dataset.fallbackApplied = "1";
                        target.src = buildSafeFallbackImageUrl(
                          generation.prompt,
                          image.id,
                          generation.frameSizeLabel
                        );
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className={styles.generatedActionRow}>
                <button
                  type="button"
                  className={styles.generatedActionButton}
                  onClick={() => handleRetryGeneration(generation)}
                >
                  Retry
                </button>
                <button
                  type="button"
                  className={styles.generatedActionButton}
                  onClick={() => handleReuseParameters(generation)}
                >
                  Reuse parameters
                </button>
                <button
                  type="button"
                  className={styles.generatedActionButton}
                  onClick={() => handleDownloadAll(generation)}
                >
                  Download all
                </button>
                <button
                  type="button"
                  className={styles.generatedActionButton}
                  onClick={() => handleDeleteGeneration(generation.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className={styles.promptDock}>
        <textarea
          className={styles.promptInput}
          placeholder="Describe an image and click generate..."
          value={promptValue}
          onChange={(event) => {
            const nextValue = event.target.value;
            setPromptValue(nextValue);
            if (activeCardId && nextValue.trim().length === 0) {
              setActiveCardId(null);
            }
          }}
        />

        <div className={styles.promptActions}>
          <button
            type="button"
            className={styles.chipButton}
            onMouseEnter={() => setIsModelMenuOpen(true)}
            onClick={() => setIsModelMenuOpen((value) => !value)}
          >
            <Sparkles size={16} />
            {selectedModel.name}
          </button>
          <button type="button" className={styles.chipButton}>
            <Link2 size={16} />
            Lora
          </button>
          <div
            className={styles.uploadChipHost}
            onMouseEnter={() => setActiveUploadPopover("image-prompt")}
            onMouseLeave={() =>
              setActiveUploadPopover((previous) =>
                previous === "image-prompt" ? null : previous
              )
            }
          >
            <button
              type="button"
              className={`${styles.chipButton} ${
                getSelectionStatus("image-prompt") ? styles.chipButtonWithSelection : ""
              }`}
            >
              <ImageIcon size={16} />
              Image prompt
              {getSelectionStatus("image-prompt") && <span className={styles.uploadChipDot} />}
            </button>
            {renderUploadPopover(
              "image-prompt",
              "Image prompts apply the style and content of any picture to your generation. Upload images or select from your asset library."
            )}
            <input
              ref={imagePromptUploadInputRef}
              type="file"
              accept="image/*"
              className={styles.uploadInputHidden}
              onChange={(event) => handleUploadInputChange("image-prompt", event.target.files)}
            />
          </div>
          <div
            className={styles.uploadChipHost}
            onMouseEnter={() => setActiveUploadPopover("style-transfer")}
            onMouseLeave={() =>
              setActiveUploadPopover((previous) =>
                previous === "style-transfer" ? null : previous
              )
            }
          >
            <button
              type="button"
              className={`${styles.chipButton} ${
                getSelectionStatus("style-transfer") ? styles.chipButtonWithSelection : ""
              }`}
            >
              <WandSparkles size={16} />
              Style transfer
              {getSelectionStatus("style-transfer") && <span className={styles.uploadChipDot} />}
            </button>
            {renderUploadPopover(
              "style-transfer",
              "Style transfer uses your reference to guide color, texture, and visual tone while preserving your prompt."
            )}
            <input
              ref={styleTransferUploadInputRef}
              type="file"
              accept="image/*"
              className={styles.uploadInputHidden}
              onChange={(event) => handleUploadInputChange("style-transfer", event.target.files)}
            />
          </div>
          <div
            className={styles.aspectChipHost}
            onMouseEnter={() => setIsAspectPopoverOpen(true)}
            onMouseLeave={() => setIsAspectPopoverOpen(false)}
          >
            <button
              type="button"
              className={styles.chipButton}
              onClick={() => setIsAspectPopoverOpen((value) => !value)}
            >
              <span className={`${styles.aspectRatioIcon} ${getAspectIconClass(selectedAspectRatio)}`} />
              {frameSizeLabel}
            </button>
            {renderAspectRatioPopover()}
          </div>
          <div
            className={styles.resolutionChipHost}
            onMouseEnter={() => setIsResolutionPopoverOpen(true)}
            onMouseLeave={() => setIsResolutionPopoverOpen(false)}
          >
            <button
              type="button"
              className={styles.chipButton}
              onClick={() => setIsResolutionPopoverOpen((value) => !value)}
            >
              <Gem size={16} />
              {selectedResolution.label}
            </button>
            {renderResolutionPopover()}
          </div>

          <button
            type="button"
            className={styles.generateButton}
            aria-label="Generate"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            <Plus size={20} />
          </button>
        </div>
        {generationError && <p className={styles.generationError}>{generationError}</p>}
      </div>
    </section>
  );
}
