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
import { SUPABASE_SESSION_SLUG, supabase } from "./supabase-client";

export const TEAM_STORAGE_KEY = `${STORAGE_KEY}:teams`;
export const SESSION_STORAGE_KEY = `${STORAGE_KEY}:session`;
export const DEFAULT_TEAM_COLOR = "#d4a52f";
export const QUESTION_TIMER_SECONDS = 30;
export const MANUAL_SCORE_STEP = 100;
const WRONG_ANSWER_VALUE_STEP = 0.25;
const REMOTE_SYNC_DEBOUNCE_MS = 150;

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

export function useJeopardySession() {
  const [session, setSession] = useState(DEFAULT_SESSION);
  const [teams, setTeams] = useState(() => createRequiredTeams());
  const [hasLoadedSession, setHasLoadedSession] = useState(false);
  const [hasLoadedTeams, setHasLoadedTeams] = useState(false);
  const [nowValue, setNowValue] = useState(() => Date.now());
  const [remoteStatus, setRemoteStatus] = useState(() => (supabase ? "connecting" : "disabled"));
  const [remoteError, setRemoteError] = useState(null);
  const sessionRef = useRef(session);
  const teamsRef = useRef(teams);
  const clientIdRef = useRef(null);
  const remoteReadyRef = useRef(false);
  const lastRemoteSnapshotRef = useRef(null);
  const needsRemoteWriteRef = useRef(false);

  if (!clientIdRef.current) {
    clientIdRef.current = createClientInstanceId();
  }

  sessionRef.current = session;
  teamsRef.current = teams;

  useEffect(() => {
    try {
      const rawSession = window.localStorage.getItem(SESSION_STORAGE_KEY);
      setSession(rawSession ? normalizeSession(JSON.parse(rawSession)) : { ...DEFAULT_SESSION });
    } catch {
      setSession({ ...DEFAULT_SESSION });
    } finally {
      setHasLoadedSession(true);
    }
  }, []);

  useEffect(() => {
    try {
      const rawTeams = window.localStorage.getItem(TEAM_STORAGE_KEY);
      setTeams(rawTeams ? normalizeTeams(JSON.parse(rawTeams)) : createRequiredTeams());
    } catch {
      setTeams(createRequiredTeams());
    } finally {
      setHasLoadedTeams(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedSession) {
      return;
    }

    try {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Ignore storage failures in private mode or kiosk browsers.
    }
  }, [hasLoadedSession, session]);

  useEffect(() => {
    if (!hasLoadedTeams) {
      return;
    }

    try {
      window.localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(teams));
    } catch {
      // Ignore storage failures in private mode or kiosk browsers.
    }
  }, [hasLoadedTeams, teams]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === SESSION_STORAGE_KEY) {
        if (!event.newValue) {
          setSession({ ...DEFAULT_SESSION });
          return;
        }

        try {
          setSession(normalizeSession(JSON.parse(event.newValue)));
        } catch {
          setSession({ ...DEFAULT_SESSION });
        }
      }

      if (event.key === TEAM_STORAGE_KEY) {
        if (!event.newValue) {
          setTeams(createRequiredTeams());
          return;
        }

        try {
          setTeams(normalizeTeams(JSON.parse(event.newValue)));
        } catch {
          setTeams(createRequiredTeams());
        }
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!supabase || !hasLoadedSession || !hasLoadedTeams) {
      return undefined;
    }

    let isMounted = true;

    const applyRemoteRow = (row) => {
      const nextSession = normalizeSession(row?.session);
      const nextTeams = normalizeTeams(row?.teams);
      const nextSnapshot = createRemoteSnapshot(nextSession, nextTeams);
      const remoteSnapshot = createRemoteSnapshot(row?.session ?? {}, row?.teams ?? []);

      needsRemoteWriteRef.current = remoteSnapshot !== nextSnapshot;
      lastRemoteSnapshotRef.current = nextSnapshot;
      setSession(nextSession);
      setTeams(nextTeams);
    };

    async function loadRemoteSession() {
      setRemoteStatus("connecting");
      setRemoteError(null);

      const { data, error } = await supabase
        .from("jeopardy_sessions")
        .select("session, teams, updated_by, updated_at")
        .eq("slug", SUPABASE_SESSION_SLUG)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      if (error) {
        remoteReadyRef.current = false;
        setRemoteStatus("error");
        setRemoteError(error.message);
        return;
      }

      if (data) {
        applyRemoteRow(data);
        remoteReadyRef.current = true;
        setRemoteStatus("connected");
        return;
      }

      const nextSession = normalizeSession(sessionRef.current);
      const nextTeams = normalizeTeams(teamsRef.current);
      const snapshot = createRemoteSnapshot(nextSession, nextTeams);
      const { error: insertError } = await supabase.from("jeopardy_sessions").upsert(
        {
          slug: SUPABASE_SESSION_SLUG,
          session: nextSession,
          teams: nextTeams,
          updated_by: clientIdRef.current,
        },
        { onConflict: "slug" },
      );

      if (!isMounted) {
        return;
      }

      if (insertError) {
        remoteReadyRef.current = false;
        setRemoteStatus("error");
        setRemoteError(insertError.message);
        return;
      }

      lastRemoteSnapshotRef.current = snapshot;
      remoteReadyRef.current = true;
      setRemoteStatus("connected");
    }

    const channel = supabase
      .channel(`jeopardy-session:${SUPABASE_SESSION_SLUG}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "jeopardy_sessions",
          filter: `slug=eq.${SUPABASE_SESSION_SLUG}`,
        },
        (payload) => {
          const nextRow = payload.new;

          if (!nextRow || nextRow.updated_by === clientIdRef.current) {
            return;
          }

          applyRemoteRow(nextRow);
          remoteReadyRef.current = true;
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
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRemoteStatus("error");
          setRemoteError("Supabase realtime channel is unavailable.");
        }
      });

    loadRemoteSession();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [hasLoadedSession, hasLoadedTeams]);

  useEffect(() => {
    if (!supabase || !hasLoadedSession || !hasLoadedTeams || !remoteReadyRef.current) {
      return undefined;
    }

    const nextSession = normalizeSession(session);
    const nextTeams = normalizeTeams(teams);
    const snapshot = createRemoteSnapshot(nextSession, nextTeams);

    if (snapshot === lastRemoteSnapshotRef.current && !needsRemoteWriteRef.current) {
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      const { error } = await supabase.from("jeopardy_sessions").upsert(
        {
          slug: SUPABASE_SESSION_SLUG,
          session: nextSession,
          teams: nextTeams,
          updated_by: clientIdRef.current,
        },
        { onConflict: "slug" },
      );

      if (error) {
        setRemoteStatus("error");
        setRemoteError(error.message);
        return;
      }

      lastRemoteSnapshotRef.current = snapshot;
      needsRemoteWriteRef.current = false;
      setRemoteStatus("connected");
      setRemoteError(null);
    }, REMOTE_SYNC_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [hasLoadedSession, hasLoadedTeams, session, teams]);

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
    const hasActiveTeam = session.activeTeamId && teams.some((team) => team.id === session.activeTeamId);
    const hasAwardedTeam = session.awardedTeamId && teams.some((team) => team.id === session.awardedTeamId);

    if (hasActiveTeam && hasAwardedTeam) {
      return;
    }

    if (!session.activeTeamId && !session.awardedTeamId) {
      return;
    }

    setSession((currentSession) => ({
      ...currentSession,
      activeTeamId:
        currentSession.activeTeamId && teams.some((team) => team.id === currentSession.activeTeamId)
          ? currentSession.activeTeamId
          : null,
      awardedTeamId:
        currentSession.awardedTeamId && teams.some((team) => team.id === currentSession.awardedTeamId)
          ? currentSession.awardedTeamId
          : null,
      awardedScoreValue:
        currentSession.awardedTeamId && teams.some((team) => team.id === currentSession.awardedTeamId)
          ? currentSession.awardedScoreValue
          : null,
    }));
  }, [session.activeTeamId, session.awardedTeamId, teams]);

  useEffect(() => {
    if (!currentEntry || session.currentStep < answerIndex || !session.timerEndsAt) {
      return;
    }

    setSession((currentSession) => withPausedTimer(currentSession));
  }, [answerIndex, currentEntry, session.currentStep, session.timerEndsAt]);

  useEffect(() => {
    if (!session.timerEndsAt || timerSecondsLeft > 0) {
      return;
    }

    setSession((currentSession) => ({
      ...currentSession,
      timerRemaining: 0,
      timerEndsAt: null,
    }));
  }, [session.timerEndsAt, timerSecondsLeft]);

  function updateSession(updater) {
    setSession((currentSession) =>
      normalizeSession(typeof updater === "function" ? updater(currentSession) : updater),
    );
  }

  function openQuestion(categoryIndex, questionIndex) {
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
    setTeams((currentTeams) =>
      normalizeTeams(currentTeams).map((team) => ({
        ...team,
        score: 0,
      })),
    );

    updateSession((currentSession) => ({
      ...currentSession,
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
    }));
  }

  function selectChoice(choiceLabel) {
    if (!currentQuestionId || !currentEntry) {
      return;
    }

    updateSession((currentSession) => {
      const currentDisabledChoices = normalizeChoiceList(currentSession.disabledChoices[currentQuestionId]);
      const currentSelectedChoice = currentSession.selectedChoices[currentQuestionId] ?? null;

      if (
        currentSession.specialIntroActive ||
        currentSession.currentStep >= answerIndex ||
        currentDisabledChoices.includes(choiceLabel) ||
        currentSelectedChoice === currentEntry.question.correctChoice
      ) {
        return currentSession;
      }

      return {
        ...currentSession,
        selectedChoices: {
          ...currentSession.selectedChoices,
          [currentQuestionId]: choiceLabel,
        },
        currentQuestionValue:
          choiceLabel === currentEntry.question.correctChoice
            ? currentSession.currentQuestionValue
            : getQuestionValueAfterWrongAnswer(
                currentSession.currentQuestionValue,
                currentEntry.question.value,
              ),
        disabledChoices:
          choiceLabel === currentEntry.question.correctChoice
            ? currentSession.disabledChoices
            : {
                ...currentSession.disabledChoices,
                [currentQuestionId]: [...currentDisabledChoices, choiceLabel],
              },
      };
    });
  }

  function addTeam(name, color = DEFAULT_TEAM_COLOR) {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    setTeams((currentTeams) => {
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
    setTeams((currentTeams) =>
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
    setTeams((currentTeams) =>
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
    setTeams((currentTeams) =>
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
    updateSession((currentSession) => ({
      ...currentSession,
      activeTeamId: currentSession.activeTeamId === teamId ? null : teamId,
    }));
  }

  function clearActiveTeam() {
    updateSession((currentSession) => ({
      ...currentSession,
      activeTeamId: null,
    }));
  }

  function toggleQuestionTimer() {
    updateSession((currentSession) => {
      if (!currentEntry || currentSession.currentStep >= answerIndex || currentSession.specialIntroActive) {
        return currentSession;
      }

      const remainingSeconds = getTimerSecondsLeft(currentSession, Date.now());

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
        timerEndsAt: Date.now() + nextRemaining * 1000,
      };
    });
  }

  function resetQuestionTimer() {
    updateSession((currentSession) => ({
      ...currentSession,
      timerRemaining: QUESTION_TIMER_SECONDS,
      timerEndsAt: null,
    }));
  }

  function pauseQuestionTimer() {
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
    const currentSession = sessionRef.current;
    const currentRound = currentSession.current;

    if (!currentRound) {
      return;
    }

    const question = gameData.categories[currentRound.categoryIndex]?.questions?.[currentRound.questionIndex];

    if (!question) {
      return;
    }

    const nextAwardValue = currentSession.currentQuestionValue ?? question.value;
    const previousAwardedTeamId = currentSession.awardedTeamId;
    const previousAwardValue = currentSession.awardedScoreValue ?? nextAwardValue;
    const nextAwardedTeamId = previousAwardedTeamId === teamId ? null : teamId;

    setTeams((currentTeams) =>
      currentTeams.map((team) => {
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
    );

    updateSession({
      ...currentSession,
      awardedTeamId: nextAwardedTeamId,
      awardedScoreValue: nextAwardedTeamId ? nextAwardValue : null,
    });
  }

  function applyScoreToActiveTeam(delta) {
    if (!session.activeTeamId) {
      return;
    }

    changeTeamScore(session.activeTeamId, delta);
    updateSession((currentSession) => ({
      ...withPausedTimer(currentSession),
      activeTeamId: null,
    }));
  }

  function removeTeam(teamId) {
    setTeams((currentTeams) => {
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
    remoteSessionSlug: SUPABASE_SESSION_SLUG,
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
