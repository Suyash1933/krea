"use client";

import {
  Check,
  ChevronDown,
  Download,
  Film,
  ImagePlus,
  PersonStanding,
  Plus,
  Sparkles,
  StopCircle,
  Upload,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { useAuth, useClerk } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./motion-transfer-workspace.module.css";

type MotionTransferWorkspaceProps = {
  activeSessionId: string | null;
  onSessionChange: (sessionId: string) => void;
  onSessionsRefresh: () => Promise<void> | void;
};

type MotionTransferModel = {
  id: string;
  name: string;
  description: string;
  costLabel: string;
};

type UploadedBinaryPayload = {
  name: string;
  mimeType: string;
  data: string;
};

type CharacterSelection = {
  source: "upload-image" | "asset-image";
  name: string;
  previewUrl: string;
  filePayload?: UploadedBinaryPayload;
  assetUrl?: string;
  assetId?: string;
};

type MotionMode = "upload" | "record";
type OrientationMode = "image" | "video";

type MotionSelection = {
  mode: MotionMode;
  name: string;
  previewUrl: string;
  filePayload: UploadedBinaryPayload;
};

type SessionVideoGeneration = {
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
  imageUrl?: string;
  createdAt: string;
};

type AssetsResponse = {
  assets?: AssetListItem[];
  error?: string;
};

type MotionTransferGenerateResponse = {
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

const motionTransferModels: MotionTransferModel[] = [
  {
    id: "kling-motion-control-v3",
    name: "Kling Motion Control v3",
    description: "Transfer motion from one video to another character.",
    costLabel: "~300",
  },
  {
    id: "kling-motion-control-v2",
    name: "Kling Motion Control v2",
    description: "Transfer motion from one video to another character with lighter control.",
    costLabel: "~300",
  },
  {
    id: "runway-aleph",
    name: "Runway Aleph",
    description: "Runway's Gen-4 Aleph model for advanced video-to-video transformation.",
    costLabel: "~400",
  },
  {
    id: "wan-2-2-animate-replace",
    name: "Wan 2.2 Animate Replace",
    description: "Replace characters in videos while preserving scene context.",
    costLabel: "~280",
  },
];

const motionTransferModelNames = new Set(motionTransferModels.map((model) => model.name));

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

const isMotionTransferGeneration = (generation: SessionVideoGeneration) => {
  if (motionTransferModelNames.has(generation.modelAlias)) {
    return true;
  }

  return generation.modelAlias.toLowerCase().includes("motion control") ||
    generation.modelAlias.toLowerCase().includes("aleph") ||
    generation.modelAlias.toLowerCase().includes("animate replace");
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
      `https://picsum.photos/seed/motion-transfer-fallback-${generation.id}-${index}/960/540`,
  })),
});

export default function MotionTransferWorkspace({
  activeSessionId,
  onSessionChange,
  onSessionsRefresh,
}: MotionTransferWorkspaceProps) {
  const characterUploadInputRef = useRef<HTMLInputElement | null>(null);
  const motionUploadInputRef = useRef<HTMLInputElement | null>(null);
  const orientationMenuRef = useRef<HTMLDivElement | null>(null);
  const managedObjectUrlsRef = useRef<string[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const recorderTimerRef = useRef<number | null>(null);

  const { isSignedIn } = useAuth();
  const { openSignIn } = useClerk();

  const [selectedModelId, setSelectedModelId] = useState(motionTransferModels[0].id);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  const [isOrientationMenuOpen, setIsOrientationMenuOpen] = useState(false);
  const [isCharacterHovered, setIsCharacterHovered] = useState(false);
  const [isMotionHovered, setIsMotionHovered] = useState(false);
  const [characterSelection, setCharacterSelection] = useState<CharacterSelection | null>(null);
  const [motionSelection, setMotionSelection] = useState<MotionSelection | null>(null);
  const [orientationMode, setOrientationMode] = useState<OrientationMode>("video");
  const [assetLibrary, setAssetLibrary] = useState<AssetListItem[]>([]);
  const [videoGenerations, setVideoGenerations] = useState<VideoGeneration[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const selectedModel = useMemo(
    () => motionTransferModels.find((model) => model.id === selectedModelId) ?? motionTransferModels[0],
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

  const clearRecorderTimer = useCallback(() => {
    if (recorderTimerRef.current !== null) {
      window.clearInterval(recorderTimerRef.current);
      recorderTimerRef.current = null;
    }
  }, []);

  const stopRecorderStream = useCallback(() => {
    recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
    recorderStreamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearRecorderTimer();
      recorderRef.current?.stop?.();
      stopRecorderStream();
      managedObjectUrlsRef.current.forEach((value) => {
        if (value.startsWith("blob:")) {
          URL.revokeObjectURL(value);
        }
      });
      managedObjectUrlsRef.current = [];
    };
  }, [clearRecorderTimer, stopRecorderStream]);

  useEffect(() => {
    if (!isOrientationMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (orientationMenuRef.current?.contains(target)) {
        return;
      }

      setIsOrientationMenuOpen(false);
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOrientationMenuOpen]);

  const loadHistory = useCallback(async (sessionId: string) => {
    setIsHistoryLoading(true);
    setGenerationError(null);

    const response = await fetch(`/api/sessions/${sessionId}`, { cache: "no-store" });
    const payload = await readJsonSafely<SessionHistoryResponse>(response);

    if (!response.ok) {
      setVideoGenerations([]);
      setIsHistoryLoading(false);
      if (response.status !== 404) {
        setGenerationError(payload?.error ?? "Failed to load motion transfer history.");
      }
      return;
    }

    const generations = (payload?.videoGenerations ?? []).filter(isMotionTransferGeneration);
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
          (asset) => asset.toolType === "Image" && typeof asset.imageUrl === "string"
        )
      );
    };

    void loadAssets();
  }, [isAssetPickerOpen]);

  const onCharacterUploadClick = () => {
    requireSignIn(() => {
      characterUploadInputRef.current?.click();
    });
  };

  const onMotionUploadClick = () => {
    requireSignIn(() => {
      motionUploadInputRef.current?.click();
    });
  };

  const onCharacterUploadChange = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) {
      return;
    }

    try {
      const data = await fileToBase64(file);
      revokeObjectUrl(characterSelection?.previewUrl);
      const mimeType = file.type || "image/png";

      setCharacterSelection({
        source: "upload-image",
        name: file.name,
        previewUrl: `data:${mimeType};base64,${data}`,
        filePayload: {
          name: file.name,
          mimeType,
          data,
        },
      });
      setGenerationError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to read character image.";
      setGenerationError(message);
    }
  };

  const onMotionUploadChange = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) {
      return;
    }

    try {
      const data = await fileToBase64(file);
      const previewUrl = URL.createObjectURL(file);
      registerObjectUrl(previewUrl);
      revokeObjectUrl(motionSelection?.previewUrl);

      setMotionSelection({
        mode: "upload",
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
      const message = error instanceof Error ? error.message : "Unable to read motion video.";
      setGenerationError(message);
    }
  };

  const onSelectCharacterAsset = (asset: AssetListItem) => {
    if (!asset.imageUrl) {
      return;
    }

    revokeObjectUrl(characterSelection?.previewUrl);
    setCharacterSelection({
      source: "asset-image",
      name: asset.prompt || "Selected character",
      previewUrl: asset.imageUrl,
      assetUrl: asset.imageUrl,
      assetId: asset.id,
    });
    setIsAssetPickerOpen(false);
    setGenerationError(null);
  };

  const clearCharacterSelection = () => {
    revokeObjectUrl(characterSelection?.previewUrl);
    setCharacterSelection(null);
  };

  const clearMotionSelection = () => {
    revokeObjectUrl(motionSelection?.previewUrl);
    setMotionSelection(null);
    setIsRecording(false);
    setRecordingSeconds(0);
    clearRecorderTimer();

    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
      return;
    }

    stopRecorderStream();
  };

  const startRecording = async () => {
    requireSignIn(async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setGenerationError("Camera recording is not supported in this browser.");
        return;
      }

      try {
        clearRecorderTimer();
        stopRecorderStream();
        recorderChunksRef.current = [];
        revokeObjectUrl(motionSelection?.previewUrl);
        setMotionSelection(null);
        setRecordingSeconds(0);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        recorderStreamRef.current = stream;
        const recorder = new MediaRecorder(stream);
        recorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recorderChunksRef.current.push(event.data);
          }
        };

        recorder.onstop = async () => {
          clearRecorderTimer();
          setIsRecording(false);

          const chunks = recorderChunksRef.current;
          recorderChunksRef.current = [];

          if (chunks.length === 0) {
            stopRecorderStream();
            return;
          }

          const mimeType = recorder.mimeType || "video/webm";
          const blob = new Blob(chunks, { type: mimeType });
          const extension = mimeType.split("/").pop()?.split(";")[0] || "webm";
          const fileName = `motion-recording-${Date.now()}.${extension}`;
          const previewUrl = URL.createObjectURL(blob);
          registerObjectUrl(previewUrl);
          revokeObjectUrl(motionSelection?.previewUrl);

          try {
            const data = await fileToBase64(blob);
            setMotionSelection({
              mode: "record",
              name: fileName,
              previewUrl,
              filePayload: {
                name: fileName,
                mimeType,
                data,
              },
            });
            setGenerationError(null);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unable to save recording.";
            setGenerationError(message);
          } finally {
            stopRecorderStream();
          }
        };

        recorder.start();
        setIsRecording(true);
        setGenerationError(null);
        recorderTimerRef.current = window.setInterval(() => {
          setRecordingSeconds((value) => value + 1);
        }, 1000);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to access your camera for recording.";
        setGenerationError(message);
        clearRecorderTimer();
        stopRecorderStream();
        setIsRecording(false);
      }
    });
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  };

  const handleGenerate = async () => {
    requireSignIn(async () => {
      if (!characterSelection) {
        setGenerationError("Add a character before generating.");
        return;
      }

      if (!motionSelection) {
        setGenerationError("Add expression and motion before generating.");
        return;
      }

      if (isGenerating) {
        return;
      }

      setIsGenerating(true);
      setGenerationError(null);

      try {
        const response = await fetch("/api/motion-transfer/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: activeSessionId ?? undefined,
            modelAlias: selectedModel.name,
            characterSource: characterSelection.source,
            characterName: characterSelection.name,
            characterImageFile: characterSelection.filePayload ?? undefined,
            characterAssetUrl: characterSelection.assetUrl ?? undefined,
            characterPreviewUrl: characterSelection.previewUrl,
            motionMode: motionSelection.mode,
            motionVideoFile: motionSelection.filePayload,
            orientationMode,
          }),
        });

        const payload = await readJsonSafely<MotionTransferGenerateResponse>(response);

        if (!response.ok || !payload?.generation) {
          const details =
            typeof payload?.details === "string" && payload.details.trim().length > 0
              ? ` ${payload.details}`
              : "";
          throw new Error(
            payload?.error
              ? `${payload.error}${details}`
              : `Motion transfer generation failed (${response.status}).`
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
        const message =
          error instanceof Error ? error.message : "Motion transfer generation failed.";
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
    anchor.download = `motion-transfer-${generation.id}-${index + 1}.mp4`;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const renderModelDropdown = () => (
    <div className={styles.modelDropdown}>
      <p className={styles.modelDropdownTitle}>Click to view all models</p>
      <div className={styles.modelDropdownScroll} role="listbox" aria-label="Motion transfer models">
        {motionTransferModels.map((model) => {
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
  );

  return (
    <section className={styles.motionTransferWorkspace}>
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
          <h1 className={styles.workspaceTitle}>
            <span className={styles.workspaceTitleIcon}>
              <PersonStanding size={24} />
            </span>
            Motion Transfer
          </h1>

          {videoGenerations.length > 0 ? (
            <div className={styles.generatedHistory}>
              {videoGenerations.map((generation) => (
                <article key={generation.id} className={styles.generatedCard}>
                  <div className={styles.generatedCardHeader}>
                    <div>
                      <p className={styles.generatedPrompt}>{generation.prompt}</p>
                      <div className={styles.generatedMetaRail}>
                        <span>{generation.modelAlias}</span>
                        <span>{generation.durationLabel}</span>
                        <span>{generation.resolutionLabel}</span>
                      </div>
                    </div>
                  </div>
                  <div className={styles.generatedVideoGrid}>
                    {generation.videos.map((video, index) => (
                      <div key={video.id} className={styles.generatedVideoCard}>
                        <video
                          src={video.videoUrl}
                          controls
                          preload="metadata"
                          poster={video.previewImage}
                          className={styles.generatedVideo}
                        />
                        <button
                          type="button"
                          className={styles.generatedDownloadButton}
                          onClick={() => handleDownloadVideo(generation, index)}
                        >
                          <Download size={16} />
                          Download
                        </button>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.emptyStage}>
              {isHistoryLoading ? (
                <p className={styles.emptyStageText}>Loading motion transfer history...</p>
              ) : null}
            </div>
          )}

          <div className={styles.generatorBoard}>
            <div
              className={`${styles.characterCard} ${characterSelection ? styles.characterCardFilled : ""}`}
              onMouseEnter={() => setIsCharacterHovered(true)}
              onMouseLeave={() => setIsCharacterHovered(false)}
            >
              {characterSelection ? (
                <>
                  <img
                    src={characterSelection.previewUrl}
                    alt={characterSelection.name}
                    className={styles.characterPreview}
                  />
                  <div className={styles.cardOverlayActions}>
                    <button
                      type="button"
                      className={styles.hoverActionButton}
                      onClick={onCharacterUploadClick}
                    >
                      <Upload size={16} />
                      Upload file
                    </button>
                    <button
                      type="button"
                      className={styles.hoverActionButtonSecondary}
                      onClick={() =>
                        requireSignIn(() => {
                          setIsAssetPickerOpen(true);
                        })
                      }
                    >
                      <ImagePlus size={16} />
                      Select asset
                    </button>
                  </div>
                  <button
                    type="button"
                    className={styles.clearSelectionButton}
                    onClick={clearCharacterSelection}
                    aria-label="Clear character selection"
                  >
                    <X size={16} />
                  </button>
                  <div className={styles.selectionCaption}>
                    {truncateText(characterSelection.name, 24)}
                  </div>
                </>
              ) : isCharacterHovered ? (
                <div className={styles.characterHoverPanel}>
                  <button
                    type="button"
                    className={styles.facePrimaryAction}
                    onClick={onCharacterUploadClick}
                  >
                    <Upload size={18} />
                    Upload file
                  </button>
                  <button
                    type="button"
                    className={styles.faceSecondaryAction}
                    onClick={() =>
                      requireSignIn(() => {
                        setIsAssetPickerOpen(true);
                      })
                    }
                  >
                    <Plus size={18} />
                    Select asset
                  </button>
                </div>
              ) : (
                <div className={styles.emptyCardContent}>
                  <UserRound size={56} />
                  <span>Add character</span>
                </div>
              )}

              {!characterSelection ? (
                <div className={styles.stepPill}>Step 1: Add character</div>
              ) : null}
            </div>

            <div className={styles.plusDivider}>+</div>

            <div
              className={`${styles.motionCard} ${
                motionSelection || isRecording ? styles.motionCardFilled : ""
              }`}
              onMouseEnter={() => setIsMotionHovered(true)}
              onMouseLeave={() => setIsMotionHovered(false)}
            >
              {isRecording ? (
                <div className={styles.recordingPanel}>
                  <div className={styles.recordingIndicator} />
                  <span className={styles.recordingTitle}>Recording motion video</span>
                  <span className={styles.recordingTime}>{recordingSeconds}s</span>
                  <button
                    type="button"
                    className={styles.recordingStopButton}
                    onClick={stopRecording}
                  >
                    <StopCircle size={18} />
                    Stop recording
                  </button>
                </div>
              ) : motionSelection ? (
                <>
                  <video
                    src={motionSelection.previewUrl}
                    controls
                    muted
                    className={styles.motionPreview}
                  />
                  <div className={styles.cardOverlayActions}>
                    <button
                      type="button"
                      className={styles.hoverActionButton}
                      onClick={onMotionUploadClick}
                    >
                      <Upload size={16} />
                      Upload
                    </button>
                    <button
                      type="button"
                      className={styles.hoverActionButtonSecondary}
                      onClick={() => void startRecording()}
                    >
                      <Video size={16} />
                      Record
                    </button>
                  </div>
                  <button
                    type="button"
                    className={styles.clearSelectionButton}
                    onClick={clearMotionSelection}
                    aria-label="Clear motion selection"
                  >
                    <X size={16} />
                  </button>
                  <div className={styles.selectionCaption}>
                    {truncateText(motionSelection.name, 30)}
                  </div>
                </>
              ) : isMotionHovered ? (
                <div className={styles.motionHoverPanel}>
                  <button
                    type="button"
                    className={styles.motionHoverAction}
                    onClick={onMotionUploadClick}
                  >
                    <Upload size={30} />
                    <strong>Upload</strong>
                    <small>Upload a video file</small>
                  </button>
                  <button
                    type="button"
                    className={styles.motionHoverAction}
                    onClick={() => void startRecording()}
                  >
                    <Video size={30} />
                    <strong>Record</strong>
                    <small>Record a video</small>
                  </button>
                </div>
              ) : (
                <div className={styles.emptyCardContent}>
                  <Film size={56} />
                  <span>Add expression & motion</span>
                </div>
              )}
            </div>

            <div className={styles.actionColumn}>
              <div className={styles.orientationHost} ref={orientationMenuRef}>
                <button
                  type="button"
                  className={`${styles.orientationButton} ${
                    isOrientationMenuOpen ? styles.orientationButtonOpen : ""
                  }`}
                  onClick={() => setIsOrientationMenuOpen((value) => !value)}
                >
                  <Video size={20} />
                  Orientation
                </button>

                {isOrientationMenuOpen ? (
                  <div className={styles.orientationPopover}>
                    <button
                      type="button"
                      className={`${styles.orientationOption} ${
                        orientationMode === "image" ? styles.orientationOptionSelected : ""
                      }`}
                      onClick={() => {
                        setOrientationMode("image");
                        setIsOrientationMenuOpen(false);
                      }}
                    >
                      <div className={styles.orientationPreviewShell}>
                        <div
                          className={`${styles.orientationPreviewFrame} ${styles.orientationPreviewImage}`}
                        >
                          <div className={styles.orientationGrid} />
                        </div>
                        {orientationMode === "image" ? (
                          <span className={styles.orientationCheck}>
                            <Check size={14} />
                          </span>
                        ) : null}
                      </div>
                      <span className={styles.orientationOptionTitle}>Image</span>
                      <span className={styles.orientationOptionDescription}>
                        Match initial pose of image
                      </span>
                    </button>

                    <button
                      type="button"
                      className={`${styles.orientationOption} ${
                        orientationMode === "video" ? styles.orientationOptionSelected : ""
                      }`}
                      onClick={() => {
                        setOrientationMode("video");
                        setIsOrientationMenuOpen(false);
                      }}
                    >
                      <div className={styles.orientationPreviewShell}>
                        <div
                          className={`${styles.orientationPreviewFrame} ${styles.orientationPreviewVideo}`}
                        >
                          <div className={styles.orientationGrid} />
                        </div>
                        {orientationMode === "video" ? (
                          <span className={styles.orientationCheck}>
                            <Check size={14} />
                          </span>
                        ) : null}
                      </div>
                      <span className={styles.orientationOptionTitle}>Video</span>
                      <span className={styles.orientationOptionDescription}>
                        Match initial pose of video
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className={styles.generateButton}
                onClick={handleGenerate}
                disabled={!characterSelection || !motionSelection || isGenerating}
              >
                <Sparkles size={18} />
                {isGenerating ? "Generating..." : "Generate"}
              </button>
            </div>
          </div>

          {generationError ? <p className={styles.generationError}>{generationError}</p> : null}
        </div>
      </div>

      {isAssetPickerOpen ? (
        <div className={styles.assetOverlay} onClick={() => setIsAssetPickerOpen(false)}>
          <div className={styles.assetModal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.assetModalHeader}>
              <div>
                <p className={styles.assetModalEyebrow}>Assets</p>
                <h2 className={styles.assetModalTitle}>Select a character image</h2>
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
                {assetLibrary.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    className={`${styles.assetCard} ${
                      characterSelection?.assetId === asset.id ? styles.assetCardSelected : ""
                    }`}
                    onClick={() => onSelectCharacterAsset(asset)}
                  >
                    <img src={asset.imageUrl} alt={asset.prompt} className={styles.assetCardImage} />
                    <div className={styles.assetCardMeta}>
                      <span className={styles.assetCardTitle}>
                        {truncateText(asset.prompt || "Asset character", 40)}
                      </span>
                      <span className={styles.assetCardBadge}>Image</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <input
        ref={characterUploadInputRef}
        type="file"
        accept="image/*"
        className={styles.hiddenInput}
        onChange={(event) => void onCharacterUploadChange(event.target.files)}
      />
      <input
        ref={motionUploadInputRef}
        type="file"
        accept="video/*"
        className={styles.hiddenInput}
        onChange={(event) => void onMotionUploadChange(event.target.files)}
      />
    </section>
  );
}
