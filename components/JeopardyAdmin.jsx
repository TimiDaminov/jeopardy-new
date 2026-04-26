"use client";

import { useEffect, useState } from "react";
import { ViewerStage, GameBoard, TeamScoreboard } from "./JeopardyShared";
import {
  DEFAULT_TEAM_COLOR,
  MANUAL_SCORE_STEP,
  QUESTION_TIMER_SECONDS,
  isRequiredTeam,
  useJeopardySession,
} from "../lib/use-jeopardy-session";
import { gameData, getQuestionId } from "../lib/game-data";

const PLANET_TEAM_PRESETS = [
  { name: "Меркурий", color: "#B7B7B7" },
  { name: "Венера", color: "#E5C27A" },
  { name: "Земля", color: "#2F81F7" },
  { name: "Марс", color: "#C34A36" },
  { name: "Юпитер", color: "#D39C6A" },
  { name: "Сатурн", color: "#D8C37A" },
  { name: "Уран", color: "#7AD8E8" },
  { name: "Нептун", color: "#426DFF" },
  { name: "Плутон", color: "#8F7C6A" },
];

function normalizePlanetName(value) {
  return value.trim().toLowerCase().replaceAll("ё", "е");
}

function getPlanetPresetByName(value) {
  const normalizedValue = normalizePlanetName(value);

  return PLANET_TEAM_PRESETS.find((preset) => normalizePlanetName(preset.name) === normalizedValue) ?? null;
}

export default function JeopardyAdmin({ sessionSlug }) {
  const {
    teams,
    played,
    current,
    currentEntry,
    currentStep,
    currentSlidePath,
    selectedChoice,
    disabledChoices,
    showAnswerOptions,
    answerShown,
    answerIndex,
    activeTeam,
    activeTeamId,
    isSpecialIntroActive,
    timerLabel,
    timerProgress,
    timerSecondsLeft,
    timerStatusClass,
    isTimerRunning,
    scoreStep,
    slideCount,
    stageLabel,
    openedCount,
    totalQuestions,
    hasTeams,
    canControl,
    remoteSessionSlug,
    canGoBack,
    canRevealAnswer,
    canAdvanceAfterAnswer,
    openQuestion,
    revealAnswer,
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
    toggleAnswerVisibility,
    pauseQuestionTimer,
    reduceCurrentQuestionValue,
    removeTeam,
  } = useJeopardySession({ canEdit: true, sessionSlug });

  const [teamNameDraft, setTeamNameDraft] = useState("");
  const [teamColorDraft, setTeamColorDraft] = useState(DEFAULT_TEAM_COLOR);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const viewerHref = remoteSessionSlug ? `/?session=${encodeURIComponent(remoteSessionSlug)}` : "/";

  useEffect(() => {
    document.body.classList.add("admin-body");

    return () => {
      document.body.classList.remove("admin-body");
    };
  }, []);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
    };
  }, []);

  useEffect(() => {
    if (!currentEntry || !canControl) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      const tagName = event.target instanceof HTMLElement ? event.target.tagName.toLowerCase() : "";

      if (tagName === "input" || tagName === "textarea" || tagName === "select") {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        toggleAnswerVisibility();
        return;
      }

      if (event.key === "ArrowRight" && answerShown && canAdvanceAfterAnswer) {
        event.preventDefault();
        advanceViewer();
        return;
      }

      if (event.key === "ArrowLeft" && answerShown && currentStep > answerIndex) {
        event.preventDefault();
        goToPreviousStep();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    currentEntry,
    answerShown,
    canAdvanceAfterAnswer,
    currentStep,
    answerIndex,
    advanceViewer,
    goToPreviousStep,
    toggleAnswerVisibility,
    canControl,
  ]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Ignore fullscreen failures on unsupported browsers.
    }
  }

  function handleAddTeam(event) {
    event.preventDefault();

    const trimmedName = teamNameDraft.trim();
    const planetPreset = getPlanetPresetByName(trimmedName);

    if (!trimmedName) {
      return;
    }

    addTeam(trimmedName, planetPreset?.color ?? teamColorDraft);
    setTeamNameDraft("");
    setTeamColorDraft(DEFAULT_TEAM_COLOR);
  }

  function handleResetGame() {
    const confirmed = window.confirm("Сбросить отметки сыгранных вопросов, ответы и таймер?");

    if (!confirmed) {
      return;
    }

    resetGame();
  }

  function handleQuestionScore(teamId, delta) {
    changeTeamScore(teamId, delta);

    if (delta < 0) {
      reduceCurrentQuestionValue();
    }

    pauseQuestionTimer();
    clearActiveTeam();
  }

  const currentQuestionId = current ? getQuestionId(current.categoryIndex, current.questionIndex) : null;
  const isCurrentPlayed = currentQuestionId ? Boolean(played[currentQuestionId]) : false;

  return (
    <div className="app-shell admin-shell">
      <header className="admin-topbar">
        <div className="admin-topbar-copy">
          <p className="admin-eyebrow">Панель ведущего</p>
          <h1 className="admin-title">{gameData.title}</h1>
          <p className="admin-subtitle">
            Все управление здесь: выбор вопроса, запуск таймера и начисление очков кнопками.
          </p>
        </div>

        <div className="admin-topbar-actions">
          <a className="action-button ghost-button" href={viewerHref} rel="noreferrer" target="_blank">
            Открыть экран
          </a>
          <button className="action-button" onClick={toggleFullscreen} type="button">
            {isFullscreen ? "Выйти из full screen" : "На весь экран"}
          </button>
          <button className="action-button ghost-button" disabled={!canControl} onClick={showBoard} type="button">
            К таблице
          </button>
          <button className="action-button danger-button" disabled={!canControl} onClick={handleResetGame} type="button">
            Сбросить игру
          </button>
        </div>
      </header>

      <TeamScoreboard
        activeTeamId={activeTeamId}
        activeTeamLabel={isSpecialIntroActive ? "Получает вопрос" : "Отвечает"}
        className="is-admin-scoreboard"
        teams={teams}
      />

      <div className="admin-page-layout">
        <main className="admin-main-column">
          {currentEntry ? (
            <section className="admin-current-card admin-current-card--page">
              <div className="admin-current-meta">
                <span className="meta-chip">{currentEntry.category.title}</span>
                <span className="meta-chip">{scoreStep}</span>
                <span className="meta-chip">{stageLabel}</span>
              </div>

              <div className="admin-live-layout">
                <ViewerStage
                  activeTeam={activeTeam}
                  answerShown={answerShown}
                  className="is-admin-stage"
                  currentEntry={currentEntry}
                  currentSlidePath={currentSlidePath}
                  currentStep={currentStep}
                  disabledChoices={disabledChoices}
                  onSelectChoice={selectChoice}
                  selectedChoice={selectedChoice}
                  showAnswerOptions={showAnswerOptions}
                  isSpecialIntroActive={isSpecialIntroActive}
                  slideClassName="is-contained-slide"
                  slideCounter={answerShown ? `${currentStep - answerIndex + 1} из ${slideCount - answerIndex}` : null}
                  timerLabel={timerLabel}
                  timerStatusClass={timerStatusClass}
                />

                <aside className="response-control-card response-control-card--sidebar">
                  <div className="response-control-header">
                    <div>
                      <h2 className="response-control-title">Управление вопросом</h2>
                      <p className="response-control-note">
                        Сначала нажмите кнопку таймера, потом отмечайте отвечающую команду и сразу начисляйте очки.
                      </p>
                    </div>

                    <div className={`timer-badge${timerStatusClass}`}>
                      <span className="timer-badge-label">Таймер</span>
                      <strong>{timerLabel}</strong>
                    </div>
                  </div>

                  <div className="timer-progress-track" aria-hidden="true">
                    <span
                      className={`timer-progress-fill${timerStatusClass}`}
                      style={{ width: `${timerProgress * 100}%` }}
                    />
                  </div>

                  {isSpecialIntroActive ? (
                    <div className="special-intro-admin-note">
                      Выберите команду, которой передают вопрос. После этого ведущий открывает вопрос пробелом.
                    </div>
                  ) : null}

                  <div className="response-action-row">
                    <button
                      className="action-button accent-button"
                      disabled={!canControl || isSpecialIntroActive}
                      onClick={toggleQuestionTimer}
                      type="button"
                    >
                      {isTimerRunning
                        ? "Пауза"
                        : timerSecondsLeft === QUESTION_TIMER_SECONDS
                          ? "Запустить таймер 30 секунд"
                          : "Продолжить таймер"}
                    </button>
                    <button
                      className="action-button ghost-button"
                      disabled={!canControl || isSpecialIntroActive}
                      onClick={resetQuestionTimer}
                      type="button"
                    >
                      Сбросить таймер
                    </button>
                  </div>

                  {hasTeams ? (
                    <div className="team-response-list">
                      {teams.map((team) => (
                        <article
                          className={`team-response-row${activeTeamId === team.id ? " is-selected" : ""}`}
                          key={`question-team-${team.id}`}
                          style={{ "--team-color": team.color }}
                        >
                          <div className="team-response-row-main">
                            <button
                              className={`answering-team-button answering-team-button--row${activeTeamId === team.id ? " is-selected" : ""}`}
                              disabled={!canControl}
                              onClick={() => selectActiveTeam(team.id)}
                              style={{ "--team-color": team.color }}
                              type="button"
                            >
                              <span className="answering-team-dot" />
                              <span>{team.name}</span>
                              {activeTeamId === team.id ? (
                                <span className="team-response-tag">Отвечает</span>
                              ) : null}
                            </button>

                            <strong className="team-response-score">{team.score}</strong>
                          </div>

                          <div className="team-response-actions">
                            <button
                              className="action-button accent-button"
                              disabled={!canControl || isSpecialIntroActive}
                              onClick={() => handleQuestionScore(team.id, scoreStep)}
                              type="button"
                            >
                              Верно +{scoreStep}
                            </button>
                            <button
                              className="action-button danger-button"
                              disabled={!canControl || isSpecialIntroActive}
                              onClick={() => handleQuestionScore(team.id, -scoreStep)}
                              type="button"
                            >
                              Неверно -{scoreStep}
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">Сначала добавьте команды в правой колонке.</div>
                  )}

                  <div className="response-action-row">
                    <button
                      className="action-button ghost-button"
                      disabled={!canControl || !activeTeamId}
                      onClick={clearActiveTeam}
                      type="button"
                    >
                      Снять отметку отвечающей команды
                    </button>
                  </div>

                  <div className="response-action-row">
                    <button
                      className="action-button ghost-button"
                      disabled={!canControl || !canGoBack}
                      onClick={goToPreviousStep}
                      type="button"
                    >
                      Назад
                    </button>
                    <button
                      className="action-button accent-button"
                      disabled={!canControl || !canRevealAnswer}
                      onClick={revealAnswer}
                      type="button"
                    >
                      {answerShown ? "Ответ показан" : "Показать ответ"}
                    </button>
                    <button
                      className="action-button"
                      disabled={!canControl || !canAdvanceAfterAnswer}
                      onClick={advanceViewer}
                      type="button"
                    >
                      {currentStep >= slideCount - 1 ? "Последний слайд" : "Следующий слайд"}
                    </button>
                  </div>

                  <div className="response-action-row">
                    <button className="action-button ghost-button" onClick={toggleCurrentPlayed} type="button">
                      {isCurrentPlayed ? "Снять отметку вопроса" : "Отметить сыгранным"}
                    </button>
                  </div>

                  <div className="admin-summary admin-summary-compact">
                    <div className="admin-stat">
                      <span className="admin-stat-label">Открыто</span>
                      <strong>
                        {openedCount} / {totalQuestions}
                      </strong>
                    </div>

                    <div className="admin-stat">
                      <span className="admin-stat-label">Слайд</span>
                      <strong>
                        {currentStep + 1} / {slideCount}
                      </strong>
                    </div>
                  </div>
                </aside>
              </div>
            </section>
          ) : (
            <section className="admin-placeholder">
              <p className="admin-eyebrow">Сейчас на экране</p>
              <h2 className="admin-placeholder-title">Таблица вопросов</h2>
              <p className="admin-section-note">
                Выберите вопрос в таблице ниже. После этого на этой же странице появятся кнопки таймера и очков.
              </p>
            </section>
          )}

          <section className="board-view admin-board-view">
            <div className="admin-section-header">
              <div>
                <h2 className="admin-section-title">Таблица</h2>
                <p className="admin-section-note">Выбор вопросов для основного экрана.</p>
              </div>
            </div>

            <GameBoard current={current} interactive={canControl} onSelectQuestion={openQuestion} played={played} />
          </section>
        </main>

        <aside className="admin-side-column">
          <section className="admin-section admin-team-section">
            <div className="admin-section-header">
              <div>
                <h2 className="admin-section-title">Команды</h2>
                <p className="admin-section-note">
                  Добавляйте команды, выбирайте им цвет и при необходимости правьте счет вручную.
                </p>
              </div>
            </div>

            <form className="team-form" onSubmit={handleAddTeam}>
              <input
                className="admin-input"
                disabled={!canControl}
                onChange={(event) => setTeamNameDraft(event.target.value)}
                placeholder="Название команды"
                type="text"
                value={teamNameDraft}
              />

              <label className="color-field">
                <span>Цвет</span>
                <input
                  className="color-input"
                  disabled={!canControl}
                  onChange={(event) => setTeamColorDraft(event.target.value)}
                  type="color"
                  value={teamColorDraft}
                />
              </label>

              <button className="action-button accent-button" disabled={!canControl} type="submit">
                Добавить
              </button>
            </form>

            <div className="planet-palette">
              <div className="admin-section-header">
                <div>
                  <h3 className="admin-section-title">Планеты и hex</h3>
                  <p className="admin-section-note">
                    Нажмите на планету, чтобы сразу подставить название команды и её цвет в форму выше.
                  </p>
                </div>
              </div>

              <div className="planet-palette-grid">
                {PLANET_TEAM_PRESETS.map((preset) => (
                  <button
                    className="planet-palette-card"
                    disabled={!canControl}
                    key={preset.name}
                    onClick={() => {
                      setTeamNameDraft(preset.name);
                      setTeamColorDraft(preset.color);
                    }}
                    style={{ "--planet-color": preset.color }}
                    type="button"
                  >
                    <span className="planet-palette-swatch" />
                    <span className="planet-palette-name">{preset.name}</span>
                    <code className="planet-palette-code">{preset.color}</code>
                  </button>
                ))}
              </div>
            </div>

            {teams.length ? (
              <div className="team-list">
                {teams.map((team) => {
                  const isBaseTeam = isRequiredTeam(team);

                  return (
                    <article className="team-card" key={team.id} style={{ "--team-color": team.color }}>
                    <div className="team-card-header">
                      <div className="team-brand">
                        <span className="team-swatch" />
                        <input
                          className="admin-input team-name-input"
                          disabled={!canControl}
                          onChange={(event) => updateTeamName(team.id, event.target.value)}
                          readOnly={isBaseTeam}
                          type="text"
                          value={team.name}
                        />
                      </div>

                      {!isBaseTeam ? (
                        <button className="icon-button" disabled={!canControl} onClick={() => removeTeam(team.id)} type="button">
                        Удалить
                        </button>
                      ) : null}
                    </div>

                    <div className="team-card-body">
                      <label className="color-field team-color-field">
                        <span>Цвет</span>
                        <input
                          className="color-input"
                          disabled={!canControl}
                          onChange={(event) => updateTeamColor(team.id, event.target.value)}
                          type="color"
                          value={team.color}
                        />
                      </label>

                      <div className="team-score-block">
                        <span className="team-score-label">Счет</span>
                        <strong className="team-score-value">{team.score}</strong>
                      </div>
                    </div>

                    <div className="team-score-actions">
                      <button
                        className="action-button ghost-button"
                        disabled={!canControl}
                        onClick={() => changeTeamScore(team.id, -MANUAL_SCORE_STEP)}
                        type="button"
                      >
                        -{MANUAL_SCORE_STEP}
                      </button>
                      <button
                        className="action-button"
                        disabled={!canControl}
                        onClick={() => changeTeamScore(team.id, MANUAL_SCORE_STEP)}
                        type="button"
                      >
                        +{MANUAL_SCORE_STEP}
                      </button>
                    </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">Команд пока нет. Добавьте первую команду сверху.</div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
