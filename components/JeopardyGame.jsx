"use client";

import { useEffect, useState } from "react";
import { ViewerStage, GameBoard, TeamScoreboard } from "./JeopardyShared";
import { useJeopardySession } from "../lib/use-jeopardy-session";

export default function JeopardyGame() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const {
    teams,
    played,
    current,
    currentEntry,
    activeTeam,
    activeTeamId,
    awardedTeamId,
    awardedScoreValue,
    timerLabel,
    timerStatusClass,
    currentStep,
    currentSlidePath,
    selectedChoice,
    disabledChoices,
    showAnswerOptions,
    answerShown,
    hasTeams,
    isSpecialIntroActive,
    isQuestionView,
    isImmersiveAnswerView,
    answerIndex,
    slideCount,
    canRevealAnswer,
    canAdvanceAfterAnswer,
    isTimerRunning,
    timerSecondsLeft,
    scoreStep,
    openQuestion,
    resetGame,
    revealAnswer,
    advanceViewer,
    goToPreviousStep,
    showBoard,
    selectChoice,
    toggleQuestionTimer,
    resetQuestionTimer,
    toggleAnswerVisibility,
    awardCurrentQuestionToTeam,
  } = useJeopardySession();

  function handleResetGame() {
    const confirmed = window.confirm("Начать игру заново и сбросить текущий прогресс?");

    if (!confirmed) {
      return;
    }

    resetGame();
  }

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

  useEffect(() => {
    if (!currentEntry) {
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
  ]);

  const slideCounter = answerShown ? `${currentStep - answerIndex + 1} из ${slideCount - answerIndex}` : null;

  return (
    <div
      className={`app-shell presentation-shell${hasTeams ? " has-scoreboard" : ""}${isImmersiveAnswerView ? " has-immersive-view" : ""}`}
    >
      <div className="presentation-topbar">
        {isSpecialIntroActive ? (
          <div className="presentation-award-hint">Кот в мешке: выберите команду</div>
        ) : answerShown && hasTeams ? (
          <div className="presentation-award-hint">
            {awardedTeamId
              ? `Начислено +${awardedScoreValue ?? scoreStep}. Нажмите ещё раз, чтобы снять, или выберите другую команду.`
              : `После ответа нажмите на нужную команду: +${scoreStep}`}
          </div>
        ) : (
          <div />
        )}

        <div className="presentation-topbar-actions">
          <button
            aria-label={isFullscreen ? "Выйти из полноэкранного режима" : "Открыть полноэкранный режим"}
            className={`icon-button fullscreen-toggle-button${isFullscreen ? " is-active" : ""}`}
            onClick={toggleFullscreen}
            title={isFullscreen ? "Выйти из полноэкранного режима" : "Открыть полноэкранный режим"}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="fullscreen-toggle-icon"
              fill="none"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              {isFullscreen ? (
                <>
                  <path d="M9 4v5H4" />
                  <path d="M15 4v5h5" />
                  <path d="M20 15h-5v5" />
                  <path d="M4 15h5v5" />
                </>
              ) : (
                <>
                  <path d="M4 9V4h5" />
                  <path d="M15 4h5v5" />
                  <path d="M20 15v5h-5" />
                  <path d="M9 20H4v-5" />
                </>
              )}
            </svg>
          </button>

          {currentEntry ? (
            <button className="action-button ghost-button presentation-reset-button" onClick={showBoard} type="button">
              К таблице
            </button>
          ) : null}

          <button className="action-button ghost-button presentation-reset-button" onClick={handleResetGame} type="button">
            Начать заново
          </button>
        </div>
      </div>

      <TeamScoreboard
        activeTeamId={activeTeamId}
        activeTeamLabel={isSpecialIntroActive ? "Получает вопрос" : "Отвечает"}
        awardedTeamId={awardedTeamId}
        awardValue={answerShown ? awardedScoreValue ?? scoreStep : null}
        interactive={answerShown}
        onSelectTeam={awardCurrentQuestionToTeam}
        teams={teams}
      />

      <main className="main-layout">
        {currentEntry ? (
          <section
            aria-live="polite"
            className={`viewer-view${isQuestionView ? " is-question-view" : ""}${isImmersiveAnswerView ? " is-immersive-view" : ""}`}
          >
            <ViewerStage
              activeTeam={activeTeam}
              answerShown={answerShown}
              className="is-presentation-stage"
              currentEntry={currentEntry}
              currentSlidePath={currentSlidePath}
              currentStep={currentStep}
              disabledChoices={disabledChoices}
              onSelectChoice={selectChoice}
              questionControls={
                isQuestionView ? (
                  <>
                    <button className="action-button accent-button" onClick={toggleQuestionTimer} type="button">
                      {isTimerRunning
                        ? "Пауза"
                        : timerSecondsLeft === 30
                          ? "Запустить таймер"
                          : "Продолжить таймер"}
                    </button>

                    <button className="action-button ghost-button" onClick={resetQuestionTimer} type="button">
                      Сбросить таймер
                    </button>

                    <button
                      className="action-button"
                      disabled={!canRevealAnswer}
                      onClick={revealAnswer}
                      type="button"
                    >
                      Показать ответ
                    </button>
                  </>
                ) : null
              }
              isSpecialIntroActive={isSpecialIntroActive}
              selectedChoice={selectedChoice}
              showAnswerOptions={showAnswerOptions}
              slideClassName={isImmersiveAnswerView ? "is-immersive-slide" : "is-contained-slide"}
              slideCounter={slideCounter}
              timerLabel={timerLabel}
              timerStatusClass={timerStatusClass}
            />
          </section>
        ) : (
          <section className="board-view">
            <GameBoard current={current} interactive onSelectQuestion={openQuestion} played={played} />
          </section>
        )}
      </main>
    </div>
  );
}
