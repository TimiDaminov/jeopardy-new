"use client";

import { useEffect, useRef, useState } from "react";
import {
  gameData,
  getQuestionId,
  getSlidePath,
  getStageLabel,
  STORAGE_KEY,
  TOTAL_QUESTIONS,
} from "./game-data";
import {
  createSessionSlug,
  DEFAULT_SUPABASE_SESSION_SLUG,
  normalizeSessionSlug,
  supabase,
} from "./supabase-client";

export const TEAM_STORAGE_KEY = `${STORAGE_KEY}:teams`;
export const SESSION_STORAGE_KEY = `${STORAGE_KEY}:session`;
export const DEFAULT_TEAM_COLOR = "#d4a52f";
export const QUESTION_TIMER_SECONDS = 30;
export const MANUAL_SCORE_STEP = 100;
const WRONG_ANSWER_VALUE_STEP = 0.25;
const REMOTE_SYNC_DEBOUNCE_MS = 150;
const DEFAULT_REMOTE_VERSION = 0;
const ANSWER_FEEDBACK_SOUND_PATHS = {
  correct: [
    "/sounds/correct.mp3",
    "/sounds/correct.wav",
    "/sounds/correct.ogg",
    "/sounds/right.mp3",
  ],
  wrong: [
    "/sounds/wrong.mp3",
    "/sounds/wrong.wav",
    "/sounds/wrong.ogg",
    "/sounds/incorrect.mp3",
  ],
};

export const REQUIRED_TEAMS = [
  { id: "team-mercury", name: "Меркурий", color: "#B7B7B7" },
  { id: "team-mars", name: "Марс", color: "#C34A36" },
  { id: "team-jupiter", name: "Юпитер", color: "#D39C6A" },
  { id: "team-saturn", name: "Сатурн", color: "#D8C37A" },
  { id: "team-uranus", name: "Уран", color: "#7AD8E8" },
  { id: "team-neptune", name: "Нептун", color: "#426DFF" },
];

const REQUIRED_TEAM_IDS = new Set(REQUIRED_TEAMS.map((team) => team.id));
const REQUIRED_TEAM_NAMES = new Set(REQUIRED_TEAMS.map((team) => normalizeTeamName(team.name)));

const DEFAULT_SESSION = {
  played: {},
  selectedChoices: {},
  disabledChoices: {},
  current: null,
  currentStep: 0,
  currentQuestionValue: null,
  specialIntroActive: false,
  awardedTeamId: null,
  awardedScoreValue: null,
  activeTeamId: null,
  timerRemaining: QUESTION_TIMER_SECONDS,
  timerEndsAt: null,
};

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeChoiceList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter((item) => typeof item === "string" && item))];
}

function normalizeChoiceMap(value) {
  const normalizedValue = normalizeObject(value);

  return Object.fromEntries(
    Object.entries(normalizedValue).map(([questionId, choices]) => [questionId, normalizeChoiceList(choices)]),
  );
}

function normalizeCurrent(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !Number.isInteger(value.categoryIndex) ||
    !Number.isInteger(value.questionIndex)
  ) {
    return null;
  }

  const category = gameData.categories[value.categoryIndex];
  const question = category?.questions?.[value.questionIndex];

  return category && question
    ? {
        categoryIndex: value.categoryIndex,
        questionIndex: value.questionIndex,
      }
    : null;
}

function normalizeTimerRemaining(value) {
  if (!Number.isFinite(value)) {
    return QUESTION_TIMER_SECONDS;
  }

  return Math.max(0, Math.min(QUESTION_TIMER_SECONDS, Math.round(value)));
}

function normalizeTimerEndsAt(value) {
  return Number.isFinite(value) ? value : null;
}

function normalizeTeamName(value) {
  return typeof value === "string" ? value.trim().toLowerCase().replaceAll("ё", "е") : "";
}

function isCatInBagQuestion(question) {
  return question?.special === "Кот в мешке";
}

function normalizeSession(rawValue) {
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return { ...DEFAULT_SESSION };
  }

  return {
    played: normalizeObject(rawValue.played),
    selectedChoices: normalizeObject(rawValue.selectedChoices),
    disabledChoices: normalizeChoiceMap(rawValue.disabledChoices),
    current: normalizeCurrent(rawValue.current),
    currentStep: Number.isInteger(rawValue.currentStep) ? Math.max(0, rawValue.currentStep) : 0,
    currentQuestionValue: Number.isFinite(rawValue.currentQuestionValue)
      ? Math.max(1, Math.round(rawValue.currentQuestionValue))
      : null,
    specialIntroActive: Boolean(rawValue.specialIntroActive),
    awardedTeamId: typeof rawValue.awardedTeamId === "string" ? rawValue.awardedTeamId : null,
    awardedScoreValue: Number.isFinite(rawValue.awardedScoreValue)
      ? Math.max(1, Math.round(rawValue.awardedScoreValue))
      : null,
    activeTeamId: typeof rawValue.activeTeamId === "string" ? rawValue.activeTeamId : null,
    timerRemaining: normalizeTimerRemaining(rawValue.timerRemaining),
    timerEndsAt: normalizeTimerEndsAt(rawValue.timerEndsAt),
  };
}

function createRequiredTeams() {
  return REQUIRED_TEAMS.map((team) => ({
    ...team,
    score: 0,
  }));
}

function ensureRequiredTeams(teams) {
  const nextTeams = [...teams];
  const presentRequiredIds = new Set();

  nextTeams.forEach((team) => {
    const requiredTeam = REQUIRED_TEAMS.find(
      (entry) => entry.id === team.id || normalizeTeamName(entry.name) === normalizeTeamName(team.name),
    );

    if (requiredTeam) {
      presentRequiredIds.add(requiredTeam.id);
    }
  });

  REQUIRED_TEAMS.forEach((requiredTeam) => {
    if (!presentRequiredIds.has(requiredTeam.id)) {
      nextTeams.push({
        ...requiredTeam,
        score: 0,
      });
    }
  });

  return nextTeams;
}

export function isRequiredTeam(value) {
  const teamId = typeof value === "string" ? value : value?.id;
  const teamName = typeof value === "string" ? "" : value?.name;

  return REQUIRED_TEAM_IDS.has(teamId) || REQUIRED_TEAM_NAMES.has(normalizeTeamName(teamName));
}

function normalizeTeams(rawValue) {
  if (!Array.isArray(rawValue)) {
    return createRequiredTeams();
  }

  const teams = rawValue
    .filter((team) => team && typeof team === "object")
    .map((team, index) => ({
      id: typeof team.id === "string" && team.id ? team.id : `team-${index + 1}`,
      name:
        typeof team.name === "string" && team.name.trim()
          ? team.name.trim()
          : `Команда ${index + 1}`,
      color: typeof team.color === "string" && team.color ? team.color : DEFAULT_TEAM_COLOR,
      score: Number.isFinite(team.score) ? team.score : 0,
    }));

  return ensureRequiredTeams(teams);
}

function createTeamId() {
  return `team-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function createClientInstanceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `client-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function createRemoteSnapshot(session, teams) {
  return JSON.stringify({ session, teams });
}

function getTimerSecondsLeft(session, nowValue) {
  if (!session.timerEndsAt) {
    return session.timerRemaining;
  }

  return Math.max(0, Math.ceil((session.timerEndsAt - nowValue) / 1000));
}

function withPausedTimer(currentSession) {
  return {
    ...currentSession,
    timerRemaining: getTimerSecondsLeft(currentSession, Date.now()),
    timerEndsAt: null,
  };
}

function getQuestionValueAfterWrongAnswer(currentValue, originalValue) {
  const nextValue = (currentValue ?? originalValue) - originalValue * WRONG_ANSWER_VALUE_STEP;

  return Math.max(1, Math.round(nextValue));
}

export function formatCountdown(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function useJeopardySession(options = {}) {
  const { canEdit = true, sessionSlug } = options;
  const shouldUseLocalStorage = !supabase;
  const remoteSessionSlug = normalizeSessionSlug(sessionSlug ?? DEFAULT_SUPABASE_SESSION_SLUG);
  const sessionStorageKey = `${SESSION_STORAGE_KEY}:${remoteSessionSlug}`;
  const teamStorageKey = `${TEAM_STORAGE_KEY}:${remoteSessionSlug}`;
  const [session, setSession] = useState(DEFAULT_SESSION);
  const [teams, setTeams] = useState(() => createRequiredTeams());
  const [hasLoadedSession, setHasLoadedSession] = useState(false);
  const [hasLoadedTeams, setHasLoadedTeams] = useState(false);
  const [nowValue, setNowValue] = useState(() => Date.now());
  const [remoteStatus, setRemoteStatus] = useState(() => (supabase ? "connecting" : "disabled"));
  const [remoteError, setRemoteError] = useState(null);
  const [isRemoteReady, setIsRemoteReady] = useState(() => !supabase);
  const [remoteVersion, setRemoteVersion] = useState(DEFAULT_REMOTE_VERSION);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const sessionRef = useRef(session);
  const teamsRef = useRef(teams);
  const clientIdRef = useRef(null);
  const answerFeedbackAudioRef = useRef(null);
  const remoteReadyRef = useRef(false);
  const remoteVersionRef = useRef(DEFAULT_REMOTE_VERSION);
  const isCommittingRef = useRef(false);
  const lastRemoteSnapshotRef = useRef(null);
  const needsRemoteWriteRef = useRef(false);
  const remoteRequestIdRef = useRef(0);
  const refreshRemoteSessionRef = useRef(async () => null);

  if (!clientIdRef.current) {
    clientIdRef.current = createClientInstanceId();
  }

  sessionRef.current = session;
  teamsRef.current = teams;

  function applyStateSnapshot(nextSessionValue, nextTeamsValue) {
    const nextSession = normalizeSession(nextSessionValue);
    const nextTeams = normalizeTeams(nextTeamsValue);
    const currentSnapshot = createRemoteSnapshot(sessionRef.current, teamsRef.current);
    const nextSnapshot = createRemoteSnapshot(nextSession, nextTeams);

    if (currentSnapshot === nextSnapshot) {
      return {
        session: sessionRef.current,
        teams: teamsRef.current,
      };
    }

    sessionRef.current = nextSession;
    teamsRef.current = nextTeams;
    setSession(nextSession);
    setTeams(nextTeams);

    return {
      session: nextSession,
      teams: nextTeams,
    };
  }

  function updateState(updater) {
    const currentSnapshot = {
      session: sessionRef.current,
      teams: teamsRef.current,
    };
    const nextValue = typeof updater === "function" ? updater(currentSnapshot) : updater;

    if (!nextValue) {
      return currentSnapshot;
    }

    return applyStateSnapshot(
      nextValue.session ?? currentSnapshot.session,
      nextValue.teams ?? currentSnapshot.teams,
    );
  }

  function updateSession(updater) {
    return updateState(({ session: currentSession, teams: currentTeams }) => ({
      session: typeof updater === "function" ? updater(currentSession) : updater,
      teams: currentTeams,
    }));
  }

  function updateTeams(updater) {
    return updateState(({ session: currentSession, teams: currentTeams }) => ({
      session: currentSession,
      teams: typeof updater === "function" ? updater(currentTeams) : updater,
    }));
  }

  function canMutateSession() {
    return canEdit && (!supabase || (remoteReadyRef.current && !isCommittingRef.current));
  }

  function shouldIgnoreIncomingRemoteState(nextSessionValue, nextTeamsValue) {
    if (!supabase || !remoteReadyRef.current || !lastRemoteSnapshotRef.current) {
      return false;
    }

    const localSnapshot = createRemoteSnapshot(sessionRef.current, teamsRef.current);
    const nextSnapshot = createRemoteSnapshot(
      normalizeSession(nextSessionValue),
      normalizeTeams(nextTeamsValue),
    );

    return localSnapshot !== lastRemoteSnapshotRef.current && localSnapshot !== nextSnapshot;
  }

  useEffect(() => {
    remoteReadyRef.current = !supabase;
    remoteVersionRef.current = DEFAULT_REMOTE_VERSION;
    isCommittingRef.current = false;
    lastRemoteSnapshotRef.current = null;
    needsRemoteWriteRef.current = false;
    remoteRequestIdRef.current = 0;
    setRemoteVersion(DEFAULT_REMOTE_VERSION);
    setIsRemoteReady(!supabase);
    setIsCommitting(false);
    setRemoteError(null);
    setRemoteStatus(supabase ? "connecting" : "disabled");
    applyStateSnapshot({ ...DEFAULT_SESSION }, createRequiredTeams());
  }, [remoteSessionSlug]);

  useEffect(() => {
    if (!shouldUseLocalStorage) {
      setHasLoadedSession(true);
      return;
    }

    try {
      const rawSession = window.localStorage.getItem(sessionStorageKey);
      applyStateSnapshot(rawSession ? JSON.parse(rawSession) : { ...DEFAULT_SESSION }, teamsRef.current);
    } catch {
      applyStateSnapshot({ ...DEFAULT_SESSION }, teamsRef.current);
    } finally {
      setHasLoadedSession(true);
    }
  }, [sessionStorageKey, shouldUseLocalStorage]);

  useEffect(() => {
    if (!shouldUseLocalStorage) {
      setHasLoadedTeams(true);
      return;
    }

    try {
      const rawTeams = window.localStorage.getItem(teamStorageKey);
      applyStateSnapshot(sessionRef.current, rawTeams ? JSON.parse(rawTeams) : createRequiredTeams());
    } catch {
      applyStateSnapshot(sessionRef.current, createRequiredTeams());
    } finally {
      setHasLoadedTeams(true);
    }
  }, [teamStorageKey, shouldUseLocalStorage]);

  useEffect(() => {
    if (!shouldUseLocalStorage || !hasLoadedSession) {
      return;
    }

    try {
      window.localStorage.setItem(sessionStorageKey, JSON.stringify(session));
    } catch {
      // Ignore storage failures in private mode or kiosk browsers.
    }
  }, [hasLoadedSession, session, sessionStorageKey, shouldUseLocalStorage]);

  useEffect(() => {
    if (!shouldUseLocalStorage || !hasLoadedTeams) {
      return;
    }

    try {
      window.localStorage.setItem(teamStorageKey, JSON.stringify(teams));
    } catch {
      // Ignore storage failures in private mode or kiosk browsers.
    }
  }, [hasLoadedTeams, teamStorageKey, teams, shouldUseLocalStorage]);

  useEffect(() => {
    if (!shouldUseLocalStorage) {
      return undefined;
    }

    const handleStorage = (event) => {
      if (event.key === sessionStorageKey) {
        try {
          applyStateSnapshot(event.newValue ? JSON.parse(event.newValue) : { ...DEFAULT_SESSION }, teamsRef.current);
        } catch {
          applyStateSnapshot({ ...DEFAULT_SESSION }, teamsRef.current);
        }
      }

      if (event.key === teamStorageKey) {
        try {
          applyStateSnapshot(sessionRef.current, event.newValue ? JSON.parse(event.newValue) : createRequiredTeams());
        } catch {
          applyStateSnapshot(sessionRef.current, createRequiredTeams());
        }
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [sessionStorageKey, shouldUseLocalStorage, teamStorageKey]);

  useEffect(() => {
    if (!supabase || !hasLoadedSession || !hasLoadedTeams) {
      return undefined;
    }

    let isMounted = true;

    const applyRemoteRow = (row) => {
      const nextVersion = Number.isFinite(row?.version) ? row.version : DEFAULT_REMOTE_VERSION;

      if (nextVersion < remoteVersionRef.current) {
        return;
      }

      const nextSession = normalizeSession(row?.session);
      const nextTeams = normalizeTeams(row?.teams);
      const nextSnapshot = createRemoteSnapshot(nextSession, nextTeams);
      const remoteSnapshot = createRemoteSnapshot(row?.session ?? {}, row?.teams ?? []);

      needsRemoteWriteRef.current = remoteSnapshot !== nextSnapshot;
      lastRemoteSnapshotRef.current = nextSnapshot;
      remoteVersionRef.current = nextVersion;
      setRemoteVersion(nextVersion);
      applyStateSnapshot(nextSession, nextTeams);
    };

    async function loadRemoteSession(options = {}) {
      const { quiet = false } = options;
      const requestId = remoteRequestIdRef.current + 1;
      remoteRequestIdRef.current = requestId;

      if (!quiet && !remoteReadyRef.current) {
        setRemoteStatus("connecting");
      }

      setRemoteError(null);

      const { data, error } = await supabase
        .from("jeopardy_sessions")
        .select("session, teams, updated_by, updated_at, version")
        .eq("slug", remoteSessionSlug)
        .maybeSingle();

      if (!isMounted || requestId !== remoteRequestIdRef.current) {
        return;
      }

      if (error) {
        remoteReadyRef.current = false;
        setIsRemoteReady(false);
        setRemoteStatus("error");
        setRemoteError(error.message);
        return;
      }

      if (data) {
        if (shouldIgnoreIncomingRemoteState(data.session, data.teams)) {
          setRemoteStatus("connected");
          return;
        }

        applyRemoteRow(data);
        remoteReadyRef.current = true;
        setIsRemoteReady(true);
        setRemoteStatus("connected");
        return;
      }

      const nextSession = normalizeSession(sessionRef.current);
      const nextTeams = normalizeTeams(teamsRef.current);
      const snapshot = createRemoteSnapshot(nextSession, nextTeams);
      const { error: insertError } = await supabase.from("jeopardy_sessions").upsert(
        {
          slug: remoteSessionSlug,
          session: nextSession,
          teams: nextTeams,
          version: DEFAULT_REMOTE_VERSION,
          updated_by: clientIdRef.current,
        },
        { onConflict: "slug" },
      );

      if (!isMounted || requestId !== remoteRequestIdRef.current) {
        return;
      }

      if (insertError) {
        remoteReadyRef.current = false;
        setIsRemoteReady(false);
        setRemoteStatus("error");
        setRemoteError(insertError.message);
        return;
      }

      lastRemoteSnapshotRef.current = snapshot;
      remoteReadyRef.current = true;
      setIsRemoteReady(true);
      remoteVersionRef.current = DEFAULT_REMOTE_VERSION;
      setRemoteVersion(DEFAULT_REMOTE_VERSION);
      setRemoteStatus("connected");
    }

    refreshRemoteSessionRef.current = loadRemoteSession;

    const channel = supabase
      .channel(`jeopardy-session:${remoteSessionSlug}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "jeopardy_sessions",
          filter: `slug=eq.${remoteSessionSlug}`,
        },
        (payload) => {
          const nextRow = payload.new;

          if (!nextRow || nextRow.updated_by === clientIdRef.current) {
            return;
          }

          if (shouldIgnoreIncomingRemoteState(nextRow.session, nextRow.teams)) {
            return;
          }

          applyRemoteRow(nextRow);
          remoteReadyRef.current = true;
          setIsRemoteReady(true);
          setRemoteStatus("connected");
          setRemoteError(null);
        },
      )
      .subscribe((status) => {
        if (!isMounted) {
          return;
        }

        if (status === "SUBSCRIBED") {
          setRemoteStatus("connected");
          void loadRemoteSession({ quiet: true });
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setIsRemoteReady(false);
          setRemoteStatus("error");
          setRemoteError("Supabase realtime channel is unavailable.");
        }
      });

    const handleWindowFocus = () => {
      void loadRemoteSession({ quiet: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadRemoteSession({ quiet: true });
      }
    };

    void loadRemoteSession();
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      refreshRemoteSessionRef.current = async () => null;
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [hasLoadedSession, hasLoadedTeams, remoteSessionSlug]);

  useEffect(() => {
    if (!supabase || !canEdit || !hasLoadedSession || !hasLoadedTeams || !remoteReadyRef.current) {
      return undefined;
    }

    const nextSession = normalizeSession(session);
    const nextTeams = normalizeTeams(teams);
    const snapshot = createRemoteSnapshot(nextSession, nextTeams);

    if (snapshot === lastRemoteSnapshotRef.current && !needsRemoteWriteRef.current) {
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      if (isCommittingRef.current) {
        return;
      }

      const expectedVersion = remoteVersionRef.current;
      const nextVersion = expectedVersion + 1;
      isCommittingRef.current = true;
      setIsCommitting(true);

      const { data, error } = await supabase
        .from("jeopardy_sessions")
        .update({
          session: nextSession,
          teams: nextTeams,
          updated_by: clientIdRef.current,
          version: nextVersion,
        })
        .eq("slug", remoteSessionSlug)
        .eq("version", expectedVersion)
        .select("session, teams, updated_by, updated_at, version")
        .maybeSingle();

      isCommittingRef.current = false;
      setIsCommitting(false);

      if (error) {
        setRemoteStatus("error");
        setRemoteError(error.message);
        return;
      }

      if (!data) {
        setRemoteError("Session version changed. Reloading latest state.");
        void refreshRemoteSessionRef.current({ quiet: true });
        return;
      }

      lastRemoteSnapshotRef.current = snapshot;
      needsRemoteWriteRef.current = false;
      remoteVersionRef.current = Number.isFinite(data?.version) ? data.version : nextVersion;
      setRemoteVersion(Number.isFinite(data?.version) ? data.version : nextVersion);
      setRemoteStatus("connected");
      setRemoteError(null);
    }, REMOTE_SYNC_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [canEdit, hasLoadedSession, hasLoadedTeams, remoteSessionSlug, session, teams]);

  const currentEntry = session.current
    ? {
        category: gameData.categories[session.current.categoryIndex],
        question: gameData.categories[session.current.categoryIndex].questions[session.current.questionIndex],
      }
    : null;

  const answerIndex = currentEntry?.question.answerIndex ?? 1;
  const slideCount = currentEntry?.question.sequence.length ?? 0;
  const explanationCount = currentEntry ? Math.max(0, slideCount - answerIndex - 1) : 0;
  const currentSlideNumber = currentEntry?.question.sequence[session.currentStep] ?? null;
  const currentQuestionId = session.current
    ? getQuestionId(session.current.categoryIndex, session.current.questionIndex)
    : null;
  const selectedChoice = currentQuestionId ? session.selectedChoices[currentQuestionId] ?? null : null;
  const disabledChoices = currentQuestionId ? normalizeChoiceList(session.disabledChoices[currentQuestionId]) : [];
  const openedCount = Object.values(session.played).filter(Boolean).length;
  const scoreHeaders = gameData.categories[0]?.questions.map((entry) => entry.value) ?? [];
  const scoreStep = currentEntry ? session.currentQuestionValue ?? currentEntry.question.value : 100;
  const timerSecondsLeft = getTimerSecondsLeft(session, nowValue);
  const isTimerRunning = Boolean(session.timerEndsAt && timerSecondsLeft > 0);
  const activeTeam = session.activeTeamId
    ? teams.find((team) => team.id === session.activeTeamId) ?? null
    : null;
  const isCatInBagActive = isCatInBagQuestion(currentEntry?.question);
  const isSpecialIntroActive = Boolean(currentEntry) && isCatInBagActive && session.specialIntroActive;
  const isQuestionView = Boolean(currentEntry) && session.currentStep < answerIndex && !isSpecialIntroActive;
  const isImmersiveAnswerView = Boolean(currentEntry) && session.currentStep >= answerIndex;
  const answerShown = Boolean(currentEntry) && session.currentStep >= answerIndex;
  const canGoBack = session.currentStep > 0;
  const canRevealAnswer = Boolean(currentEntry) && session.currentStep < answerIndex && !isSpecialIntroActive;
  const canAdvanceAfterAnswer =
    Boolean(currentEntry) && session.currentStep >= answerIndex && session.currentStep < slideCount - 1;
  const showAnswerOptions =
    Boolean(currentEntry?.question.choices?.length) && session.currentStep < answerIndex && !isSpecialIntroActive;
  const isSessionReady = hasLoadedSession && hasLoadedTeams && (!supabase || isRemoteReady);
  const canControl = canEdit && isSessionReady && !isCommitting;

  useEffect(() => {
    setNowValue(Date.now());
  }, [session.timerEndsAt]);

  useEffect(() => {
    if (!isTimerRunning) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNowValue(Date.now());
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isTimerRunning]);

  useEffect(() => {
    const shouldClearActiveTeam =
      Boolean(session.activeTeamId) && !teams.some((team) => team.id === session.activeTeamId);
    const shouldClearAwardedTeam =
      Boolean(session.awardedTeamId) && !teams.some((team) => team.id === session.awardedTeamId);

    if (!shouldClearActiveTeam && !shouldClearAwardedTeam) {
      return;
    }

    updateSession((currentSession) => ({
      ...currentSession,
      activeTeamId: shouldClearActiveTeam ? null : currentSession.activeTeamId,
      awardedTeamId: shouldClearAwardedTeam ? null : currentSession.awardedTeamId,
      awardedScoreValue: shouldClearAwardedTeam ? null : currentSession.awardedScoreValue,
    }));
  }, [session.activeTeamId, session.awardedTeamId, teams]);

  useEffect(() => {
    if (!currentEntry || session.currentStep < answerIndex || !session.timerEndsAt) {
      return;
    }

    updateSession((currentSession) => withPausedTimer(currentSession));
  }, [answerIndex, currentEntry, session.currentStep, session.timerEndsAt]);

  useEffect(() => {
    return () => {
      const activeAudio = answerFeedbackAudioRef.current;

      if (!activeAudio) {
        return;
      }

      activeAudio.pause();
      activeAudio.currentTime = 0;
      answerFeedbackAudioRef.current = null;
    };
  }, []);

  function playAnswerFeedbackSound(kind, attemptIndex = 0) {
    const soundPaths = ANSWER_FEEDBACK_SOUND_PATHS[kind] ?? [];

    if (typeof Audio === "undefined" || attemptIndex >= soundPaths.length) {
      return;
    }

    const nextAudio = new Audio(soundPaths[attemptIndex]);
    nextAudio.preload = "auto";
    nextAudio.volume = 0.96;
    nextAudio.onerror = () => {
      if (answerFeedbackAudioRef.current === nextAudio) {
        answerFeedbackAudioRef.current = null;
      }

      playAnswerFeedbackSound(kind, attemptIndex + 1);
    };
    nextAudio.onended = () => {
      if (answerFeedbackAudioRef.current === nextAudio) {
        answerFeedbackAudioRef.current = null;
      }
    };

    const activeAudio = answerFeedbackAudioRef.current;

    if (activeAudio) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    }

    answerFeedbackAudioRef.current = nextAudio;

    const playPromise = nextAudio.play();

    if (!playPromise || typeof playPromise.catch !== "function") {
      return;
    }

    playPromise.catch((error) => {
      if (answerFeedbackAudioRef.current === nextAudio) {
        answerFeedbackAudioRef.current = null;
      }

      if (error?.name === "NotAllowedError") {
        return;
      }

      playAnswerFeedbackSound(kind, attemptIndex + 1);
    });
  }

  function openQuestion(categoryIndex, questionIndex) {
    if (!canMutateSession()) {
      return;
    }

    const questionId = getQuestionId(categoryIndex, questionIndex);
    const question = gameData.categories[categoryIndex].questions[questionIndex];

    updateSession((currentSession) => {
      const nextSelectedChoices = { ...currentSession.selectedChoices };
      const nextDisabledChoices = { ...currentSession.disabledChoices };
      delete nextSelectedChoices[questionId];
      delete nextDisabledChoices[questionId];

      return {
        ...currentSession,
        current: { categoryIndex, questionIndex },
        currentStep: 0,
        currentQuestionValue:
          question.value,
        specialIntroActive: isCatInBagQuestion(question),
        awardedTeamId: null,
        awardedScoreValue: null,
        activeTeamId: null,
        timerRemaining: QUESTION_TIMER_SECONDS,
        timerEndsAt: null,
        selectedChoices: nextSelectedChoices,
        disabledChoices: nextDisabledChoices,
        played: {
          ...currentSession.played,
          [questionId]: true,
        },
      };
    });
  }

  function revealAnswer() {
    if (!canMutateSession()) {
      return;
    }

    updateSession((currentSession) => {
      if (!currentEntry || currentSession.currentStep >= answerIndex || currentSession.specialIntroActive) {
        return currentSession;
      }

      return {
        ...withPausedTimer(currentSession),
        currentStep: answerIndex,
      };
    });
  }

  function toggleAnswerVisibility() {
    if (!canMutateSession()) {
      return;
    }

    updateSession((currentSession) => {
      if (!currentEntry) {
        return currentSession;
      }

      if (currentSession.specialIntroActive) {
        return {
          ...withPausedTimer(currentSession),
          specialIntroActive: false,
        };
      }

      if (currentSession.currentStep < answerIndex) {
        return {
          ...withPausedTimer(currentSession),
          currentStep: answerIndex,
        };
      }

      return {
        ...withPausedTimer(currentSession),
        currentStep: Math.max(0, answerIndex - 1),
      };
    });
  }

  function advanceViewer() {
    if (!canMutateSession()) {
      return;
    }

    updateSession((currentSession) => {
      if (!currentEntry) {
        return currentSession;
      }

      if (currentSession.currentStep < answerIndex) {
        return {
          ...withPausedTimer(currentSession),
          currentStep: answerIndex,
        };
      }

      if (currentSession.currentStep < slideCount - 1) {
        return {
          ...currentSession,
          currentStep: currentSession.currentStep + 1,
        };
      }

      return currentSession;
    });
  }

  function goToPreviousStep() {
    if (!canMutateSession()) {
      return;
    }

    updateSession((currentSession) => {
      if (!currentEntry || currentSession.currentStep === 0) {
        return currentSession;
      }

      return {
        ...withPausedTimer(currentSession),
        currentStep: currentSession.currentStep - 1,
      };
    });
  }

  function showBoard() {
    if (!canMutateSession()) {
      return;
    }

    updateSession((currentSession) => ({
      ...currentSession,
      current: null,
      currentStep: 0,
      currentQuestionValue: null,
      specialIntroActive: false,
      awardedTeamId: null,
      awardedScoreValue: null,
      activeTeamId: null,
      timerRemaining: QUESTION_TIMER_SECONDS,
      timerEndsAt: null,
    }));
  }

  function toggleCurrentPlayed() {
    if (!canMutateSession()) {
      return;
    }

    updateSession((currentSession) => {
      if (!currentSession.current) {
        return currentSession;
      }

      const questionId = getQuestionId(
        currentSession.current.categoryIndex,
        currentSession.current.questionIndex,
      );

      return {
        ...currentSession,
        played: {
          ...currentSession.played,
          [questionId]: !currentSession.played[questionId],
        },
      };
    });
  }

  function resetGame() {
    if (!canMutateSession()) {
      return;
    }

    const nextState = updateState(({ teams: currentTeams }) => ({
      teams: normalizeTeams(currentTeams).map((team) => ({
        ...team,
        score: 0,
      })),
      session: {
        ...DEFAULT_SESSION,
      },
    }));

  }

  function selectChoice(choiceLabel) {
    if (!canMutateSession()) {
      return;
    }

    if (!currentQuestionId || !currentEntry) {
      return;
    }

    const currentSession = sessionRef.current;
    const currentDisabledChoices = normalizeChoiceList(currentSession.disabledChoices[currentQuestionId]);
    const currentSelectedChoice = currentSession.selectedChoices[currentQuestionId] ?? null;

    if (
      currentSession.specialIntroActive ||
      currentSession.currentStep >= answerIndex ||
      currentDisabledChoices.includes(choiceLabel) ||
      currentSelectedChoice === currentEntry.question.correctChoice
    ) {
      return;
    }

    const isCorrectChoice = choiceLabel === currentEntry.question.correctChoice;

    updateSession((currentSession) => {
      return {
        ...currentSession,
        selectedChoices: {
          ...currentSession.selectedChoices,
          [currentQuestionId]: choiceLabel,
        },
        currentQuestionValue:
          isCorrectChoice
            ? currentSession.currentQuestionValue
            : getQuestionValueAfterWrongAnswer(
                currentSession.currentQuestionValue,
                currentEntry.question.value,
              ),
        disabledChoices:
          isCorrectChoice
            ? currentSession.disabledChoices
            : {
                ...currentSession.disabledChoices,
                [currentQuestionId]: [...currentDisabledChoices, choiceLabel],
              },
      };
    });

    playAnswerFeedbackSound(isCorrectChoice ? "correct" : "wrong");
  }

  function addTeam(name, color = DEFAULT_TEAM_COLOR) {
    if (!canMutateSession()) {
      return;
    }

    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    updateTeams((currentTeams) => {
      if (currentTeams.some((team) => normalizeTeamName(team.name) === normalizeTeamName(trimmedName))) {
        return currentTeams;
      }

      return [
        ...currentTeams,
        {
          id: createTeamId(),
          name: trimmedName,
          color,
          score: 0,
        },
      ];
    });
  }

  function updateTeamName(teamId, nextName) {
    if (!canMutateSession()) {
      return;
    }

    updateTeams((currentTeams) =>
      currentTeams.map((team) =>
        team.id === teamId && !isRequiredTeam(team)
          ? {
              ...team,
              name: nextName,
            }
          : team,
      ),
    );
  }

  function updateTeamColor(teamId, nextColor) {
    if (!canMutateSession()) {
      return;
    }

    updateTeams((currentTeams) =>
      currentTeams.map((team) =>
        team.id === teamId
          ? {
              ...team,
              color: nextColor,
            }
          : team,
      ),
    );
  }

  function changeTeamScore(teamId, delta) {
    if (!canMutateSession()) {
      return;
    }

    updateTeams((currentTeams) =>
      currentTeams.map((team) =>
        team.id === teamId
          ? {
              ...team,
              score: team.score + delta,
            }
          : team,
      ),
    );
  }

  function selectActiveTeam(teamId) {
    if (!canMutateSession()) {
      return;
    }

    updateSession((currentSession) => ({
      ...currentSession,
      activeTeamId: currentSession.activeTeamId === teamId ? null : teamId,
    }));
  }

  async function createNewSession() {
    const nextSlug = createSessionSlug();

    if (!supabase) {
      return nextSlug;
    }

    setIsCreatingSession(true);
    setRemoteError(null);

    const { error } = await supabase.from("jeopardy_sessions").insert({
      slug: nextSlug,
      session: { ...DEFAULT_SESSION },
      teams: createRequiredTeams(),
      version: DEFAULT_REMOTE_VERSION,
      updated_by: clientIdRef.current,
    });

    setIsCreatingSession(false);

    if (error) {
      setRemoteStatus("error");
      setRemoteError(error.message);
      return null;
    }

    return nextSlug;
  }

  function clearActiveTeam() {
    if (!canMutateSession()) {
      return;
    }

    updateSession((currentSession) => ({
      ...currentSession,
      activeTeamId: null,
    }));
  }

  function toggleQuestionTimer() {
    if (!canMutateSession()) {
      return;
    }

    updateSession((currentSession) => {
      if (!currentEntry || currentSession.currentStep >= answerIndex || currentSession.specialIntroActive) {
        return currentSession;
      }

      const now = Date.now();
      const remainingSeconds = getTimerSecondsLeft(currentSession, now);

      if (currentSession.timerEndsAt && remainingSeconds > 0) {
        return {
          ...currentSession,
          timerRemaining: remainingSeconds,
          timerEndsAt: null,
        };
      }

      const nextRemaining = remainingSeconds > 0 ? remainingSeconds : QUESTION_TIMER_SECONDS;

      return {
        ...currentSession,
        timerRemaining: nextRemaining,
        timerEndsAt: now + nextRemaining * 1000,
      };
    });
  }

  function resetQuestionTimer() {
    if (!canMutateSession()) {
      return;
    }

    updateSession((currentSession) => ({
      ...currentSession,
      timerRemaining: QUESTION_TIMER_SECONDS,
      timerEndsAt: null,
    }));
  }

  function pauseQuestionTimer() {
    if (!canMutateSession()) {
      return;
    }

    updateSession((currentSession) => {
      if (!currentSession.timerEndsAt) {
        return currentSession;
      }

      return {
        ...currentSession,
        timerRemaining: getTimerSecondsLeft(currentSession, Date.now()),
        timerEndsAt: null,
      };
    });
  }

  function reduceCurrentQuestionValue() {
    if (!canMutateSession()) {
      return;
    }

    updateSession((currentSession) => {
      if (!currentEntry) {
        return currentSession;
      }

      return {
        ...currentSession,
        currentQuestionValue: getQuestionValueAfterWrongAnswer(
          currentSession.currentQuestionValue,
          currentEntry.question.value,
        ),
      };
    });
  }

  function awardCurrentQuestionToTeam(teamId) {
    if (!canMutateSession()) {
      return;
    }

    updateState(({ session: currentSession, teams: currentTeams }) => {
      const currentRound = currentSession.current;

      if (!currentRound) {
        return null;
      }

      const question = gameData.categories[currentRound.categoryIndex]?.questions?.[currentRound.questionIndex];

      if (!question) {
        return null;
      }

      const nextAwardValue = currentSession.currentQuestionValue ?? question.value;
      const previousAwardedTeamId = currentSession.awardedTeamId;
      const previousAwardValue = currentSession.awardedScoreValue ?? nextAwardValue;
      const nextAwardedTeamId = previousAwardedTeamId === teamId ? null : teamId;

      return {
        teams: currentTeams.map((team) => {
          let nextScore = team.score;

          if (previousAwardedTeamId && team.id === previousAwardedTeamId) {
            nextScore -= previousAwardValue;
          }

          if (nextAwardedTeamId && team.id === nextAwardedTeamId) {
            nextScore += nextAwardValue;
          }

          return nextScore === team.score
            ? team
            : {
                ...team,
                score: nextScore,
              };
        }),
        session: {
          ...currentSession,
          awardedTeamId: nextAwardedTeamId,
          awardedScoreValue: nextAwardedTeamId ? nextAwardValue : null,
        },
      };
    });
  }

  function applyScoreToActiveTeam(delta) {
    if (!canMutateSession()) {
      return;
    }

    updateState(({ session: currentSession, teams: currentTeams }) => {
      if (!currentSession.activeTeamId) {
        return null;
      }

      return {
        teams: currentTeams.map((team) =>
          team.id === currentSession.activeTeamId
            ? {
                ...team,
                score: team.score + delta,
              }
            : team,
        ),
        session: {
          ...withPausedTimer(currentSession),
          activeTeamId: null,
        },
      };
    });
  }

  function removeTeam(teamId) {
    if (!canMutateSession()) {
      return;
    }

    updateTeams((currentTeams) => {
      const teamToRemove = currentTeams.find((team) => team.id === teamId);

      if (isRequiredTeam(teamToRemove)) {
        return currentTeams;
      }

      return normalizeTeams(currentTeams.filter((team) => team.id !== teamId));
    });
  }

  return {
    teams,
    currentEntry,
    scoreHeaders,
    openedCount,
    answerIndex,
    slideCount,
    explanationCount,
    currentSlideNumber,
    currentQuestionId,
    selectedChoice,
    disabledChoices,
    isCatInBagActive,
    isSpecialIntroActive,
    isQuestionView,
    isImmersiveAnswerView,
    answerShown,
    canGoBack,
    canRevealAnswer,
    canAdvanceAfterAnswer,
    showAnswerOptions,
    isSessionReady,
    scoreStep,
    hasTeams: teams.length > 0,
    activeTeam,
    activeTeamId: session.activeTeamId,
    awardedTeamId: session.awardedTeamId,
    awardedScoreValue: session.awardedScoreValue,
    timerSecondsLeft,
    timerLabel: formatCountdown(timerSecondsLeft),
    timerProgress: Math.max(0, Math.min(1, timerSecondsLeft / QUESTION_TIMER_SECONDS)),
    timerStatusClass: timerSecondsLeft === 0 ? " is-ended" : isTimerRunning ? " is-running" : "",
    isTimerRunning,
    remoteStatus,
    remoteError,
    isRemoteEnabled: Boolean(supabase),
    remoteSessionSlug,
    remoteVersion,
    isCommitting,
    isCreatingSession,
    canControl,
    played: session.played,
    selectedChoices: session.selectedChoices,
    disabledChoicesByQuestion: session.disabledChoices,
    current: session.current,
    currentStep: session.currentStep,
    currentSlidePath: currentSlideNumber ? getSlidePath(currentSlideNumber) : "",
    stageLabel: isSpecialIntroActive
      ? "Кот в мешке"
      : getStageLabel(session.currentStep, answerIndex, explanationCount),
    totalQuestions: TOTAL_QUESTIONS,
    openQuestion,
    revealAnswer,
    toggleAnswerVisibility,
    advanceViewer,
    goToPreviousStep,
    showBoard,
    toggleCurrentPlayed,
    resetGame,
    createNewSession,
    selectChoice,
    addTeam,
    updateTeamName,
    updateTeamColor,
    changeTeamScore,
    selectActiveTeam,
    clearActiveTeam,
    toggleQuestionTimer,
    resetQuestionTimer,
    pauseQuestionTimer,
    reduceCurrentQuestionValue,
    awardCurrentQuestionToTeam,
    applyScoreToActiveTeam,
    removeTeam,
  };
}
