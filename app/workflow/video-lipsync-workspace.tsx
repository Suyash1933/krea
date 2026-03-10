"use client";

import {
  Check,
  ChevronDown,
  Download,
  ImagePlus,
  Mic,
  Plus,
  Sparkles,
  StopCircle,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { useAuth, useClerk } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./video-lipsync-workspace.module.css";

type VideoLipSyncWorkspaceProps = {
  activeSessionId: string | null;
  onSessionChange: (sessionId: string) => void;
  onSessionsRefresh: () => Promise<void> | void;
};

type LipSyncModel = {
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

type FaceSelection = {
  source: "upload-image" | "asset-image";
  name: string;
  previewUrl: string;
  filePayload?: UploadedBinaryPayload;
  assetUrl?: string;
  assetId?: string;
};

type SpeechMode = "generate" | "upload" | "record" | null;

type SpeechAudioSelection = {
  mode: "upload" | "record";
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

type LipSyncGenerateResponse = {
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

const lipSyncModels: LipSyncModel[] = [
  {
    id: "fabric",
    name: "Fabric",
    description: "Turn any image into a talking video. By VEED.",
    costLabel: "0",
  },
  {
    id: "fabric-fast",
    name: "Fabric Fast",
    description: "Turn any image into a talking video faster. By VEED.",
    costLabel: "~300",
  },
  {
    id: "hedra",
    name: "Hedra",
    description: "Omnimodal lipsync model by Hedra.",
    costLabel: "~200",
  },
];

const lipSyncModelNames = new Set(lipSyncModels.map((model) => model.name));

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

const isLipSyncGeneration = (generation: SessionVideoGeneration) => {
  if (lipSyncModelNames.has(generation.modelAlias)) {
    return true;
  }

  return generation.modelAlias.toLowerCase().includes("hedra") ||
    generation.modelAlias.toLowerCase().includes("fabric");
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
      `https://picsum.photos/seed/lipsync-fallback-${generation.id}-${index}/960/540`,
  })),
});

export default function VideoLipSyncWorkspace({
  activeSessionId,
  onSessionChange,
  onSessionsRefresh,
}: VideoLipSyncWorkspaceProps) {
  const faceUploadInputRef = useRef<HTMLInputElement | null>(null);
  const speechUploadInputRef = useRef<HTMLInputElement | null>(null);
  const managedObjectUrlsRef = useRef<string[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const recorderTimerRef = useRef<number | null>(null);

  const { isSignedIn } = useAuth();
  const { openSignIn } = useClerk();

  const [selectedModelId, setSelectedModelId] = useState(lipSyncModels[2].id);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  const [isFaceHovered, setIsFaceHovered] = useState(false);
  const [isSpeechHovered, setIsSpeechHovered] = useState(false);
  const [faceSelection, setFaceSelection] = useState<FaceSelection | null>(null);
  const [speechMode, setSpeechMode] = useState<SpeechMode>(null);
  const [speechPrompt, setSpeechPrompt] = useState("");
  const [speechAudioSelection, setSpeechAudioSelection] = useState<SpeechAudioSelection | null>(
    null
  );
  const [assetLibrary, setAssetLibrary] = useState<AssetListItem[]>([]);
  const [videoGenerations, setVideoGenerations] = useState<VideoGeneration[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const selectedModel = useMemo(
    () => lipSyncModels.find((model) => model.id === selectedModelId) ?? lipSyncModels[0],
    [selectedModelId]
  );

  const hasSpeechReady = useMemo(() => {
    if (speechMode === "generate") {
      return speechPrompt.trim().length > 0;
    }

    if (speechMode === "upload" || speechMode === "record") {
      return Boolean(speechAudioSelection);
    }

    return false;
  }, [speechAudioSelection, speechMode, speechPrompt]);

  const currentStep = useMemo(() => {
    if (!faceSelection) {
      return { key: "face", label: "Step 1: Add face" } as const;
    }

    if (!hasSpeechReady) {
      return { key: "speech", label: "Step 2: Add speech" } as const;
    }

    return null;
  }, [faceSelection, hasSpeechReady]);

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

  const loadHistory = useCallback(async (sessionId: string) => {
    setIsHistoryLoading(true);
    setGenerationError(null);

    const response = await fetch(`/api/sessions/${sessionId}`, { cache: "no-store" });
    const payload = await readJsonSafely<SessionHistoryResponse>(response);

    if (!response.ok) {
      setVideoGenerations([]);
      setIsHistoryLoading(false);
      if (response.status !== 404) {
        setGenerationError(payload?.error ?? "Failed to load lip sync history.");
      }
      return;
    }

    const generations = (payload?.videoGenerations ?? []).filter(isLipSyncGeneration);
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

  const onFaceUploadClick = () => {
    requireSignIn(() => {
      faceUploadInputRef.current?.click();
    });
  };

  const onSpeechUploadClick = () => {
    requireSignIn(() => {
      speechUploadInputRef.current?.click();
    });
  };

  const onFaceUploadChange = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) {
      return;
    }

    try {
      const data = await fileToBase64(file);
      revokeObjectUrl(faceSelection?.previewUrl);
      const mimeType = file.type || "image/png";
      setFaceSelection({
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
      const message = error instanceof Error ? error.message : "Unable to read face image.";
      setGenerationError(message);
    }
  };

  const onSelectFaceAsset = (asset: AssetListItem) => {
    const imageUrl = asset.imageUrl;
    if (!imageUrl) {
      return;
    }

    revokeObjectUrl(faceSelection?.previewUrl);
    setFaceSelection({
      source: "asset-image",
      name: asset.prompt || "Selected face",
      previewUrl: imageUrl,
      assetUrl: imageUrl,
      assetId: asset.id,
    });
    setIsAssetPickerOpen(false);
    setGenerationError(null);
  };

  const clearFaceSelection = () => {
    revokeObjectUrl(faceSelection?.previewUrl);
    setFaceSelection(null);
  };

  const clearSpeechSelection = () => {
    revokeObjectUrl(speechAudioSelection?.previewUrl);
    setSpeechMode(null);
    setSpeechPrompt("");
    setSpeechAudioSelection(null);
    setIsRecording(false);
    setRecordingSeconds(0);
    clearRecorderTimer();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    } else {
      stopRecorderStream();
    }
  };

  const onSpeechUploadChange = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) {
      return;
    }

    try {
      const data = await fileToBase64(file);
      const previewUrl = URL.createObjectURL(file);
      registerObjectUrl(previewUrl);
      revokeObjectUrl(speechAudioSelection?.previewUrl);

      setSpeechMode("upload");
      setSpeechAudioSelection({
        mode: "upload",
        name: file.name,
        previewUrl,
        filePayload: {
          name: file.name,
          mimeType: file.type || "audio/mpeg",
          data,
        },
      });
      setGenerationError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to read audio file.";
      setGenerationError(message);
    }
  };

  const startRecording = async () => {
    requireSignIn(async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setGenerationError("Microphone recording is not supported in this browser.");
        return;
      }

      try {
        clearRecorderTimer();
        stopRecorderStream();
        recorderChunksRef.current = [];
        setSpeechMode("record");
        revokeObjectUrl(speechAudioSelection?.previewUrl);
        setSpeechAudioSelection(null);
        setRecordingSeconds(0);

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

          const mimeType = recorder.mimeType || "audio/webm";
          const blob = new Blob(chunks, { type: mimeType });
          const extension = mimeType.split("/").pop()?.split(";")[0] || "webm";
          const fileName = `recorded-speech-${Date.now()}.${extension}`;
          const previewUrl = URL.createObjectURL(blob);
          registerObjectUrl(previewUrl);
          revokeObjectUrl(speechAudioSelection?.previewUrl);

          try {
            const data = await fileToBase64(blob);
            setSpeechAudioSelection({
              mode: "record",
              name: fileName,
              previewUrl,
              filePayload: {
                name: fileName,
                mimeType,
                data,
              },
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unable to save recording.";
            setGenerationError(message);
          } finally {
            stopRecorderStream();
          }
        };

        recorder.start();
        setIsRecording(true);
        recorderTimerRef.current = window.setInterval(() => {
          setRecordingSeconds((value) => value + 1);
        }, 1000);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to access microphone for recording.";
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
      if (!faceSelection) {
        setGenerationError("Add a face image before generating.");
        return;
      }

      if (!hasSpeechReady || !speechMode) {
        setGenerationError("Add speech before generating.");
        return;
      }

      if (isGenerating) {
        return;
      }

      setIsGenerating(true);
      setGenerationError(null);

      try {
        const response = await fetch("/api/video-lipsync/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: activeSessionId ?? undefined,
            modelAlias: selectedModel.name,
            faceSource: faceSelection.source,
            faceName: faceSelection.name,
            faceImageFile: faceSelection.filePayload ?? undefined,
            faceAssetUrl: faceSelection.assetUrl ?? undefined,
            facePreviewUrl: faceSelection.previewUrl,
            speechMode,
            speechPrompt: speechMode === "generate" ? speechPrompt.trim() || undefined : undefined,
            speechAudioFile:
              speechMode === "upload" || speechMode === "record"
                ? speechAudioSelection?.filePayload
                : undefined,
          }),
        });

        const payload = await readJsonSafely<LipSyncGenerateResponse>(response);

        if (!response.ok || !payload?.generation) {
          const details =
            typeof payload?.details === "string" && payload.details.trim().length > 0
              ? ` ${payload.details}`
              : "";
          throw new Error(
            payload?.error
              ? `${payload.error}${details}`
              : `Lip sync generation failed (${response.status}).`
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
        const message = error instanceof Error ? error.message : "Lip sync generation failed.";
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
    anchor.download = `lip-sync-${generation.id}-${index + 1}.mp4`;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const renderModelDropdown = () => (
    <div className={styles.modelDropdown}>
      <p className={styles.modelDropdownTitle}>Click to view all models</p>
      <div className={styles.modelDropdownScroll} role="listbox" aria-label="Lip sync models">
        {lipSyncModels.map((model) => {
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

  return (
    <section className={styles.lipSyncWorkspace}>
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
              <Mic size={24} />
            </span>
            Lip sync
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
                <p className={styles.emptyStageText}>Loading lip sync history...</p>
              ) : null}
            </div>
          )}

          <div className={styles.generatorBoard}>
            <div
              className={`${styles.faceCard} ${faceSelection ? styles.faceCardFilled : ""}`}
              onMouseEnter={() => setIsFaceHovered(true)}
              onMouseLeave={() => setIsFaceHovered(false)}
            >
              {faceSelection ? (
                <>
                  <img
                    src={faceSelection.previewUrl}
                    alt={faceSelection.name}
                    className={styles.facePreview}
                  />
                  <div className={styles.cardOverlayActions}>
                    <button type="button" className={styles.hoverActionButton} onClick={onFaceUploadClick}>
                      <Upload size={16} />
                      Upload image
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
                    onClick={clearFaceSelection}
                    aria-label="Clear face selection"
                  >
                    <X size={16} />
                  </button>
                  <div className={styles.selectionCaption}>{truncateText(faceSelection.name, 24)}</div>
                </>
              ) : isFaceHovered ? (
                <div className={styles.faceHoverPanel}>
                  <button
                    type="button"
                    className={styles.facePrimaryAction}
                    onClick={onFaceUploadClick}
                  >
                    <Upload size={18} />
                    Upload image
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
                  <span>Add face</span>
                </div>
              )}
              {currentStep?.key === "face" ? (
                <div className={styles.stepPill}>{currentStep.label}</div>
              ) : null}
            </div>

            <div className={styles.plusDivider}>+</div>

            <div
              className={`${styles.speechCard} ${
                hasSpeechReady || speechMode ? styles.speechCardFilled : ""
              }`}
              onMouseEnter={() => setIsSpeechHovered(true)}
              onMouseLeave={() => setIsSpeechHovered(false)}
            >
              {speechMode === "generate" ? (
                <div className={styles.speechGeneratePanel}>
                  <div className={styles.speechPanelHead}>
                    <span className={styles.speechModeBadge}>
                      <Sparkles size={16} />
                      Generate speech
                    </span>
                    <button
                      type="button"
                      className={styles.clearSelectionButton}
                      onClick={clearSpeechSelection}
                      aria-label="Clear speech mode"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <textarea
                    className={styles.speechTextarea}
                    value={speechPrompt}
                    onChange={(event) => setSpeechPrompt(event.target.value)}
                    placeholder="Write and generate speech..."
                  />
                </div>
              ) : speechAudioSelection ? (
                <div className={styles.audioSelectionPanel}>
                  <div className={styles.speechPanelHead}>
                    <span className={styles.speechModeBadge}>
                      <Mic size={16} />
                      {speechAudioSelection.mode === "record" ? "Recorded speech" : "Uploaded audio"}
                    </span>
                    <button
                      type="button"
                      className={styles.clearSelectionButton}
                      onClick={clearSpeechSelection}
                      aria-label="Clear speech audio"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <p className={styles.audioSelectionName}>
                    {truncateText(speechAudioSelection.name, 48)}
                  </p>
                  <audio controls src={speechAudioSelection.previewUrl} className={styles.audioPlayer} />
                  {speechAudioSelection.mode === "upload" ? (
                    <button
                      type="button"
                      className={styles.inlineChangeButton}
                      onClick={onSpeechUploadClick}
                    >
                      Change audio
                    </button>
                  ) : null}
                </div>
              ) : isRecording ? (
                <div className={styles.recordingPanel}>
                  <div className={styles.recordingIndicator} />
                  <span className={styles.recordingTitle}>Recording voice</span>
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
              ) : isSpeechHovered ? (
                <div className={styles.speechHoverPanel}>
                  <button
                    type="button"
                    className={styles.speechHoverAction}
                    onClick={() => {
                      setSpeechMode("generate");
                      setSpeechAudioSelection(null);
                    }}
                  >
                    <Sparkles size={26} />
                    <strong>Generate</strong>
                    <small>Write and generate speech</small>
                  </button>
                  <button
                    type="button"
                    className={styles.speechHoverAction}
                    onClick={onSpeechUploadClick}
                  >
                    <Upload size={26} />
                    <strong>Upload</strong>
                    <small>Upload an audio file</small>
                  </button>
                  <button
                    type="button"
                    className={styles.speechHoverAction}
                    onClick={() => void startRecording()}
                  >
                    <Mic size={26} />
                    <strong>Record</strong>
                    <small>Record your voice</small>
                  </button>
                </div>
              ) : (
                <div className={styles.emptyCardContent}>
                  <Mic size={56} />
                  <span>Add speech</span>
                </div>
              )}
              {currentStep?.key === "speech" ? (
                <div className={styles.stepPill}>{currentStep.label}</div>
              ) : null}
            </div>

            <button
              type="button"
              className={styles.generateButton}
              onClick={handleGenerate}
              disabled={!faceSelection || !hasSpeechReady || isGenerating}
            >
              <Sparkles size={18} />
              {isGenerating ? "Generating..." : "Generate"}
            </button>
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
                <h2 className={styles.assetModalTitle}>Select a face image</h2>
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
                      faceSelection?.assetId === asset.id ? styles.assetCardSelected : ""
                    }`}
                    onClick={() => onSelectFaceAsset(asset)}
                  >
                    <img src={asset.imageUrl} alt={asset.prompt} className={styles.assetCardImage} />
                    <div className={styles.assetCardMeta}>
                      <span className={styles.assetCardTitle}>
                        {truncateText(asset.prompt || "Asset face", 40)}
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
        ref={faceUploadInputRef}
        type="file"
        accept="image/*"
        className={styles.hiddenInput}
        onChange={(event) => void onFaceUploadChange(event.target.files)}
      />
      <input
        ref={speechUploadInputRef}
        type="file"
        accept="audio/*"
        className={styles.hiddenInput}
        onChange={(event) => void onSpeechUploadChange(event.target.files)}
      />
    </section>
  );
}
