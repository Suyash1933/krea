"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Cuboid,
  Columns2,
  Film,
  Folder,
  Home,
  Image as ImageIcon,
  MoreHorizontal,
  Mic,
  LogIn,
  Pencil,
  Trash2,
  PersonStanding,
  Phone,
  Plus,
  Search,
  Sparkles,
  Video,
  WandSparkles,
  Workflow,
  Zap,
} from "lucide-react";
import {
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
  useClerk,
  useUser,
} from "@clerk/nextjs";
import styles from "./page.module.css";
import ImageWorkspace from "./workflow/image-workspace";
import AssetsWorkspace from "./workflow/assets-workspace";
import VideoWorkspace from "./workflow/video-workspace";
import EnhancerWorkspace from "./workflow/enhancer-workspace";
import NanoBananaWorkspace from "./workflow/nano-banana-workspace";
import VideoLipSyncWorkspace from "./workflow/video-lipsync-workspace";
import MotionTransferWorkspace from "./workflow/motion-transfer-workspace";
import VideoRestyleWorkspace from "./workflow/video-restyle-workspace";
import EditWorkspace from "./workflow/edit-workspace";
import ThreeDObjectsWorkspace from "./workflow/three-d-objects-workspace";
import NodeEditorWorkspace from "./workflow/node-editor-workspace";
import TrainLoraWorkspace from "./workflow/train-lora-workspace";
import HomeWorkspace from "./workflow/home-workspace";

type MainView =
  | "home"
  | "workflow"
  | "train-lora"
  | "image"
  | "assets"
  | "video"
  | "enhancer"
  | "edit"
  | "3d-objects"
  | "nano-banana"
  | "video-lipsync"
  | "motion-transfer"
  | "video-restyle";
type SearchScope = "sessions" | "tools";

type NavItem = {
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  iconBackground: string;
  iconColor?: string;
};

type SessionSummary = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  lastMessage: string | null;
  previewImage: string | null;
};

const workspaceItems: NavItem[] = [
  { label: "Home", icon: Home, iconBackground: "linear-gradient(145deg,#f3f6ff,#d2defe)", iconColor: "#151515" },
  { label: "Train Lora", icon: Sparkles, iconBackground: "conic-gradient(from 220deg,#f97316,#fde047,#22c55e,#3b82f6,#f97316)", iconColor: "#ffffff" },
  { label: "Node Editor", icon: Workflow, iconBackground: "linear-gradient(145deg,#3c9dff,#2463ff)", iconColor: "#ffffff" },
  { label: "Assets", icon: Folder, iconBackground: "linear-gradient(145deg,#7dd3fc,#38bdf8)", iconColor: "#0f1d35" },
];

const toolItems: NavItem[] = [
  { label: "Image", icon: ImageIcon, iconBackground: "linear-gradient(145deg,#e6edff,#ffffff)", iconColor: "#0f172a" },
  { label: "Video", icon: Video, iconBackground: "linear-gradient(145deg,#fde68a,#fbbf24)", iconColor: "#3f2d06" },
  { label: "Enhancer", icon: WandSparkles, iconBackground: "linear-gradient(145deg,#313741,#0f1115)", iconColor: "#ececec" },
  { label: "Nano Banana", icon: Phone, iconBackground: "linear-gradient(145deg,#fde047,#facc15)", iconColor: "#3f2d06" },
  { label: "Realtime", icon: Zap, iconBackground: "linear-gradient(145deg,#38bdf8,#2563eb)", iconColor: "#ffffff" },
  { label: "Edit", icon: Pencil, iconBackground: "linear-gradient(145deg,#7c3aed,#6d28d9)", iconColor: "#f9f5ff" },
  { label: "Video Lipsync", icon: Mic, iconBackground: "linear-gradient(145deg,#1f2937,#0b0f19)", iconColor: "#e5e7eb" },
  { label: "Motion Transfer", icon: PersonStanding, iconBackground: "linear-gradient(145deg,#d9f99d,#84cc16)", iconColor: "#1f2937" },
  { label: "3D Objects", icon: Cuboid, iconBackground: "linear-gradient(145deg,#e5e7eb,#cbd5e1)", iconColor: "#1f2937" },
  { label: "Video Restyle", icon: Film, iconBackground: "linear-gradient(145deg,#fcd34d,#f59e0b)", iconColor: "#3f2d06" },
];

function SideItem({ item, active, onClick }: { item: NavItem; active?: boolean; onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <button type="button" className={`${styles.sideItem} ${active ? styles.sideItemActive : ""}`} onClick={onClick}>
      <span className={styles.sideIcon} style={{ background: item.iconBackground, color: item.iconColor ?? "#fff" }}>
        <Icon size={14} />
      </span>
      <span className={styles.sideItemLabel}>{item.label}</span>
    </button>
  );
}

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

export default function HomePage() {
  const router = useRouter();
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const { openSignIn } = useClerk();
  const { user } = useUser();

  const [mainView, setMainView] = useState<MainView>(() => {
    if (typeof window === "undefined") {
      return "workflow";
    }
    const params = new URLSearchParams(window.location.search);
    const tool = params.get("tool");
    if (tool === "home") {
      return "home";
    }
    if (tool === "image") {
      return "image";
    }
    if (tool === "video") {
      return "video";
    }
    if (tool === "enhancer") {
      return "enhancer";
    }
    if (tool === "edit") {
      return "edit";
    }
    if (tool === "3d-objects") {
      return "3d-objects";
    }
    if (tool === "nano-banana") {
      return "nano-banana";
    }
    if (tool === "video-lipsync") {
      return "video-lipsync";
    }
    if (tool === "motion-transfer") {
      return "motion-transfer";
    }
    if (tool === "video-restyle") {
      return "video-restyle";
    }
    if (tool === "train-lora") {
      return "train-lora";
    }
    if (tool === "assets") {
      return "assets";
    }
    return "workflow";
  });
  const [searchScope, setSearchScope] = useState<SearchScope>("sessions");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isToolsExpanded, setIsToolsExpanded] = useState(false);
  const [activeToolLabel, setActiveToolLabel] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    const tool = new URLSearchParams(window.location.search).get("tool");
    if (tool === "image") {
      return "Image";
    }
    if (tool === "video") {
      return "Video";
    }
    if (tool === "enhancer") {
      return "Enhancer";
    }
    if (tool === "edit") {
      return "Edit";
    }
    if (tool === "3d-objects") {
      return "3D Objects";
    }
    if (tool === "nano-banana") {
      return "Nano Banana";
    }
    if (tool === "video-lipsync") {
      return "Video Lipsync";
    }
    if (tool === "motion-transfer") {
      return "Motion Transfer";
    }
    if (tool === "video-restyle") {
      return "Video Restyle";
    }
    return "";
  });
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(336);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [openSessionMenuId, setOpenSessionMenuId] = useState<string | null>(null);

  const setMainViewWithRoute = useCallback((nextView: MainView) => {
    const params = new URLSearchParams(window.location.search);
    if (nextView === "image") {
      params.set("tool", "image");
      setActiveToolLabel("Image");
    } else if (nextView === "home") {
      params.set("tool", "home");
      setActiveToolLabel("");
    } else if (nextView === "video") {
      params.set("tool", "video");
      setActiveToolLabel("Video");
    } else if (nextView === "enhancer") {
      params.set("tool", "enhancer");
      setActiveToolLabel("Enhancer");
    } else if (nextView === "edit") {
      params.set("tool", "edit");
      setActiveToolLabel("Edit");
    } else if (nextView === "3d-objects") {
      params.set("tool", "3d-objects");
      setActiveToolLabel("3D Objects");
    } else if (nextView === "nano-banana") {
      params.set("tool", "nano-banana");
      setActiveToolLabel("Nano Banana");
    } else if (nextView === "video-lipsync") {
      params.set("tool", "video-lipsync");
      setActiveToolLabel("Video Lipsync");
    } else if (nextView === "motion-transfer") {
      params.set("tool", "motion-transfer");
      setActiveToolLabel("Motion Transfer");
    } else if (nextView === "video-restyle") {
      params.set("tool", "video-restyle");
      setActiveToolLabel("Video Restyle");
    } else if (nextView === "train-lora") {
      params.set("tool", "train-lora");
      setActiveToolLabel("");
    } else if (nextView === "assets") {
      params.set("tool", "assets");
      setActiveToolLabel("");
    } else {
      params.delete("tool");
      setActiveToolLabel("");
    }
    setMainView(nextView);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router]);

  const loadSessions = useCallback(async () => {
    if (!isSignedIn) {
      setSessions([]);
      setActiveSessionId(null);
      return;
    }
    const response = await fetch("/api/sessions", { cache: "no-store" });
    if (!response.ok) {
      setSessionsError("Failed to load sessions.");
      return;
    }
    const payload = (await readJsonSafely<{ sessions?: SessionSummary[] }>(response)) ?? {};
    const next = payload.sessions ?? [];
    setSessions(next);
    setActiveSessionId((prev) => (prev && next.some((x) => x.id === prev) ? prev : null));
  }, [isSignedIn]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSessions();
  }, [loadSessions]);

  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => `${s.title} ${s.lastMessage ?? ""}`.toLowerCase().includes(q));
  }, [searchQuery, sessions]);

  const requireSignIn = (callback: () => void) => {
    if (!isSignedIn) {
      openSignIn();
      return;
    }
    callback();
  };

  useEffect(() => {
    if (!openSessionMenuId) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-session-menu-root='true']")) {
        return;
      }
      setOpenSessionMenuId(null);
    };

    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [openSessionMenuId]);

  const getSessionTargetView = useCallback((): MainView => {
    if (mainView === "video" || activeToolLabel === "Video") {
      return "video";
    }

    if (mainView === "enhancer" || activeToolLabel === "Enhancer") {
      return "enhancer";
    }

    if (mainView === "edit" || activeToolLabel === "Edit") {
      return "edit";
    }

    if (mainView === "3d-objects" || activeToolLabel === "3D Objects") {
      return "3d-objects";
    }

    if (mainView === "nano-banana" || activeToolLabel === "Nano Banana") {
      return "nano-banana";
    }

    if (mainView === "video-lipsync" || activeToolLabel === "Video Lipsync") {
      return "video-lipsync";
    }

    if (mainView === "motion-transfer" || activeToolLabel === "Motion Transfer") {
      return "motion-transfer";
    }

    if (mainView === "video-restyle" || activeToolLabel === "Video Restyle") {
      return "video-restyle";
    }

    return "image";
  }, [activeToolLabel, mainView]);

  const createSession = async () => {
    if (!isSignedIn) {
      openSignIn();
      return;
    }
    setSessionsError(null);
    setOpenSessionMenuId(null);
    setActiveSessionId(null);
    setMainViewWithRoute(getSessionTargetView());
  };

  const openSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setMainViewWithRoute(getSessionTargetView());
    setOpenSessionMenuId(null);
  };

  const deleteSession = async (sessionId: string) => {
    if (!isSignedIn) {
      openSignIn();
      return;
    }

    const response = await fetch(`/api/sessions/${sessionId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setSessionsError("Failed to delete session.");
      return;
    }

    const nextSessions = sessions.filter((session) => session.id !== sessionId);
    setSessions(nextSessions);
    setActiveSessionId((previous) =>
      previous === sessionId ? null : previous
    );
    setOpenSessionMenuId(null);
  };

  const userDisplayName =
    user?.fullName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress ||
    "User";
  const collapsedToolCount = 5;
  const visibleToolItems = isToolsExpanded ? toolItems : toolItems.slice(0, collapsedToolCount);
  const hasMoreTools = toolItems.length > collapsedToolCount;
  const effectiveSidebarWidth = isSidebarCompact ? 76 : sidebarWidth;

  const beginSidebarResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (isSidebarCompact) {
      return;
    }

    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    setIsSidebarResizing(true);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidth = Math.min(420, Math.max(240, startWidth + delta));
      setSidebarWidth(nextWidth);
    };

    const onPointerUp = () => {
      setIsSidebarResizing(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  return (
    <main
      className={`${styles.shell} ${mainView !== "workflow" && mainView !== "train-lora" ? styles.shellImageMode : ""}`}
      style={{ "--sidebar-width": `${effectiveSidebarWidth}px` } as CSSProperties}
    >
      <aside className={`${styles.sidebar} ${isSidebarCompact ? styles.sidebarCompact : ""}`}>
        <div className={`${styles.sidebarScroll} ${isToolsExpanded ? styles.sidebarScrollExpanded : ""}`}>
          <button
            type="button"
            className={styles.collapseButton}
            aria-label={isSidebarCompact ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setIsSidebarCompact((value) => !value)}
          >
            <Columns2 size={17} />
          </button>

          <div className={styles.sidebarGroup}>
            {workspaceItems.map((item) => {
              const isActive =
                (item.label === "Home" && mainView === "home") ||
                (item.label === "Train Lora" && mainView === "train-lora") ||
                (item.label === "Node Editor" && mainView === "workflow") ||
                (item.label === "Assets" && mainView === "assets");

              return (
                <SideItem
                  key={item.label}
                  item={item}
                  active={isActive}
                  onClick={() =>
                    requireSignIn(() => {
                      if (item.label === "Home") {
                        setMainViewWithRoute("home");
                        return;
                      }
                      if (item.label === "Assets") {
                        setMainViewWithRoute("assets");
                        return;
                      }
                      if (item.label === "Train Lora") {
                        setMainViewWithRoute("train-lora");
                        return;
                      }
                      setMainViewWithRoute("workflow");
                    })
                  }
                />
              );
            })}
          </div>

          <div className={styles.sidebarSectionHead}><span className={styles.sidebarSectionLabel}>Tools</span></div>
          <div className={styles.sidebarGroup}>
            {visibleToolItems.map((item) => (
              <SideItem
                key={item.label}
                item={item}
                active={item.label === activeToolLabel}
                onClick={() =>
                  requireSignIn(() => {
                    setActiveToolLabel(item.label);
                    if (item.label === "Image") {
                      setMainViewWithRoute("image");
                      return;
                    }
                    if (item.label === "Video") {
                      setMainViewWithRoute("video");
                      return;
                    }
                    if (item.label === "Enhancer") {
                      setMainViewWithRoute("enhancer");
                      return;
                    }
                    if (item.label === "Edit") {
                      setMainViewWithRoute("edit");
                      return;
                    }
                    if (item.label === "3D Objects") {
                      setMainViewWithRoute("3d-objects");
                      return;
                    }
                    if (item.label === "Nano Banana") {
                      setMainViewWithRoute("nano-banana");
                      return;
                    }
                    if (item.label === "Video Lipsync") {
                      setMainViewWithRoute("video-lipsync");
                      return;
                    }
                    if (item.label === "Motion Transfer") {
                      setMainViewWithRoute("motion-transfer");
                      return;
                    }
                    if (item.label === "Video Restyle") {
                      setMainViewWithRoute("video-restyle");
                    }
                  })
                }
              />
            ))}
            {hasMoreTools && (
              <button
                type="button"
                className={styles.moreItem}
                aria-expanded={isToolsExpanded}
                onClick={() => setIsToolsExpanded((value) => !value)}
              >
                <span className={styles.sideItemLabel}>... {isToolsExpanded ? "Less" : "More"}</span>
              </button>
            )}
          </div>

          {isSignedIn && (
            <>
              <div className={styles.sidebarSectionHead}>
                <span className={styles.sidebarSectionLabel}>Sessions</span>
                <button type="button" className={styles.sectionSearchButton} onClick={() => { setSearchScope("sessions"); setSearchQuery(""); setIsSearchOpen(true); }}><Search size={14} /></button>
              </div>
              <div className={styles.sessionList}>
                <button type="button" className={styles.newSessionButton} onClick={createSession}>
                  <span className={styles.newSessionIcon}><Plus size={14} /></span>
                  <span className={styles.newSessionLabel}>New Session</span>
                </button>
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`${styles.sessionItemRow} ${
                      session.id === activeSessionId ? styles.sessionItemRowActive : ""
                    }`}
                    data-session-menu-root="true"
                  >
                    <button
                      type="button"
                      className={`${styles.sessionItemButton} ${
                        session.id === activeSessionId ? styles.sessionItemButtonActive : ""
                      }`}
                      onClick={() => openSession(session.id)}
                    >
                      <span
                        className={styles.sessionItemThumb}
                        style={session.previewImage ? { backgroundImage: `url(${session.previewImage})` } : undefined}
                      >
                        {!session.previewImage && session.title.charAt(0).toUpperCase()}
                      </span>
                      <span className={styles.sessionItemBody}>
                        <span className={styles.sessionItemTitle}>{session.title}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label="Session options"
                      className={styles.sessionMenuButton}
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenSessionMenuId((previous) =>
                          previous === session.id ? null : session.id
                        );
                      }}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {openSessionMenuId === session.id && (
                      <div className={styles.sessionContextMenu}>
                        <button
                          type="button"
                          className={styles.sessionContextMenuItem}
                          onClick={() => openSession(session.id)}
                        >
                          Open Session
                        </button>
                        <button
                          type="button"
                          className={`${styles.sessionContextMenuItem} ${styles.sessionContextMenuItemDanger}`}
                          onClick={() => deleteSession(session.id)}
                        >
                          <Trash2 size={14} />
                          Delete Session
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {sessionsError && <p className={styles.sessionErrorText}>{sessionsError}</p>}
              </div>
            </>
          )}
        </div>

        <div className={styles.sidebarBottom}>
          <SignedOut>
            <button type="button" className={styles.signInButton} onClick={() => openSignIn()}>
              <LogIn size={17} className={styles.signInIcon} />
              <span className={styles.signInLabel}>Sign in</span>
            </button>
          </SignedOut>
          <SignedIn>
            <div className={styles.signedInRow}>
              <UserButton />
              <div className={styles.userNamePill}>{userDisplayName}</div>
            </div>
          </SignedIn>
        </div>
      </aside>
      <button
        type="button"
        aria-label="Resize sidebar"
        className={`${styles.sidebarResizeHandle} ${isSidebarResizing ? styles.sidebarResizeHandleActive : ""}`}
        onPointerDown={beginSidebarResize}
      >
        ↔
      </button>

      <section className={`${styles.mainArea} ${mainView !== "workflow" && mainView !== "train-lora" ? styles.mainAreaImageMode : ""}`}>
        {mainView === "home" ? (
          <HomeWorkspace
            onOpenImage={() => setMainViewWithRoute("image")}
            onOpenVideo={() => setMainViewWithRoute("video")}
          />
        ) : mainView === "train-lora" ? (
          <TrainLoraWorkspace />
        ) : mainView === "image" ? (
          <ImageWorkspace activeSessionId={activeSessionId} onSessionChange={setActiveSessionId} onSessionsRefresh={loadSessions} />
        ) : mainView === "video" ? (
          <VideoWorkspace
            activeSessionId={activeSessionId}
            onSessionChange={setActiveSessionId}
            onSessionsRefresh={loadSessions}
          />
        ) : mainView === "enhancer" ? (
          <EnhancerWorkspace
            activeSessionId={activeSessionId}
            onSessionChange={setActiveSessionId}
            onSessionsRefresh={loadSessions}
          />
        ) : mainView === "edit" ? (
          <EditWorkspace
            activeSessionId={activeSessionId}
            onSessionChange={setActiveSessionId}
            onSessionsRefresh={loadSessions}
          />
        ) : mainView === "3d-objects" ? (
          <ThreeDObjectsWorkspace
            activeSessionId={activeSessionId}
            onSessionChange={setActiveSessionId}
            onSessionsRefresh={loadSessions}
          />
        ) : mainView === "nano-banana" ? (
          <NanoBananaWorkspace
            activeSessionId={activeSessionId}
            onSessionChange={setActiveSessionId}
            onSessionsRefresh={loadSessions}
          />
        ) : mainView === "video-lipsync" ? (
          <VideoLipSyncWorkspace
            activeSessionId={activeSessionId}
            onSessionChange={setActiveSessionId}
            onSessionsRefresh={loadSessions}
          />
        ) : mainView === "motion-transfer" ? (
          <MotionTransferWorkspace
            activeSessionId={activeSessionId}
            onSessionChange={setActiveSessionId}
            onSessionsRefresh={loadSessions}
          />
        ) : mainView === "video-restyle" ? (
          <VideoRestyleWorkspace
            activeSessionId={activeSessionId}
            onSessionChange={setActiveSessionId}
            onSessionsRefresh={loadSessions}
          />
        ) : mainView === "assets" ? (
          <AssetsWorkspace />
        ) : (
          <NodeEditorWorkspace />
        )}
      </section>

      {isSearchOpen && (
        <div className={styles.searchOverlay} onClick={() => setIsSearchOpen(false)}>
          <div className={styles.searchModal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.searchModalHeader}><Search size={20} /><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className={styles.searchInput} placeholder={searchScope === "sessions" ? "Search sessions..." : "Search tools..."} /></div>
            <div className={styles.searchResults}>
              {searchScope === "sessions" && filteredSessions.length === 0 ? <p className={styles.searchEmpty}>No matching sessions</p> : null}
              {searchScope === "sessions" ? filteredSessions.map((session) => (
                <button key={session.id} type="button" className={`${styles.searchResultItem} ${session.id === activeSessionId ? styles.searchResultItemActive : ""}`} onClick={() => { setActiveSessionId(session.id); setMainViewWithRoute(getSessionTargetView()); setIsSearchOpen(false); }}>
                  <span className={styles.searchResultContent}><span className={styles.searchResultText}>{session.title}</span></span>
                </button>
              )) : null}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
