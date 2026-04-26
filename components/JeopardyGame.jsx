"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ViewerStage, GameBoard, TeamScoreboard } from "./JeopardyShared";
import { useJeopardySession } from "../lib/use-jeopardy-session";

export default function JeopardyGame({ sessionSlug }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const router = useRouter();
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
    canGoBack,
    canRevealAnswer,
    canAdvanceAfterAnswer,
    isTimerRunning,
    timerSecondsLeft,
    scoreStep,
    isSessionReady,
    canControl,
    isCreatingSession,
    openQuestion,
    resetGame,
    createNewSession,
    revealAnswer,
    advanceViewer,
    goToPreviousStep,
    showBoard,
    selectChoice,
    toggleQuestionTimer,
    resetQuestionTimer,
    toggleAnswerVisibility,
    awardCurrentQuestionToTeam,
  } = useJeopardySession({ canEdit: true, sessionSlug });

  function handleResetGame() {
    const confirmed = window.confirm("Начать игру заново и сбросить текущий прогресс?");

    if (!confirmed) {
      return;
    }

    resetGame();
  }

  async function handleCreateNewGame() {
    const confirmed = window.confirm("Создать новую игровую сессию и перейти в нее?");

    if (!confirmed) {
      return;
    }

    const nextSlug = await createNewSession();

    if (!nextSlug) {
      return;
    }

    router.push(`/?session=${encodeURIComponent(nextSlug)}`);
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

  const slideCounter = answerShown ? `${currentStep - answerIndex + 1} из ${slideCount - answerIndex}` : null;

  return (
    <div
      className={`app-shell presentation-shell${hasTeams ? " has-scoreboard" : ""}${isImmersiveAnswerView ? " has-immersive-view" : ""}`}
    >
      <div className="presentation-topbar">
        {isSpecialIntroActive ? (
          <div className="presentation-award-hint">Кот в мешке: выберите команду</div>
        ) : !isSessionReady ? (
          <div className="presentation-award-hint">Syncing session...</div>
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
            <button
              className="action-button ghost-button presentation-reset-button"
              disabled={!canControl}
              onClick={showBoard}
              type="button"
            >
              К таблице
            </button>
          ) : null}

          <button
            className="action-button ghost-button presentation-reset-button"
            disabled={!canControl || isCreatingSession}
            onClick={handleCreateNewGame}
            type="button"
          >
            {isCreatingSession ? "Создание..." : "Новая игра"}
          </button>

          {/* <button
            className="action-button ghost-button presentation-reset-button"
            disabled={!canControl}
            hidden
            onClick={handleResetGame}
            type="button"
          >
            Начать заново
          </button> */}
        </div>
      </div>

      <TeamScoreboard
        activeTeamId={activeTeamId}
        activeTeamLabel={isSpecialIntroActive ? "Получает вопрос" : "Отвечает"}
        awardedTeamId={awardedTeamId}
        awardValue={answerShown ? awardedScoreValue ?? scoreStep : null}
        interactive={answerShown && canControl}
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
              onSelectChoice={canControl ? selectChoice : undefined}
              questionControls={
                isQuestionView && canControl ? (
                  <>
                    <button
                      className="action-button accent-button"
                      disabled={!canControl}
                      onClick={toggleQuestionTimer}
                      type="button"
                    >
                      {isTimerRunning
                        ? "Пауза"
                        : timerSecondsLeft === 30
                          ? "Запустить таймер"
                          : "Продолжить таймер"}
                    </button>

                    <button
                      className="action-button ghost-button"
                      disabled={!canControl}
                      onClick={resetQuestionTimer}
                      type="button"
                    >
                      Сбросить таймер
                    </button>

                    <button
                      className="action-button"
                      disabled={!canControl || !canRevealAnswer}
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

            {canControl && answerShown ? (
              <div className="viewer-stage-controls">
                <button
                  className="action-button ghost-button"
                  disabled={!canGoBack}
                  onClick={goToPreviousStep}
                  type="button"
                >
                  РќР°Р·Р°Рґ
                </button>

                <button
                  className="action-button"
                  disabled={!canAdvanceAfterAnswer}
                  onClick={advanceViewer}
                  type="button"
                >
                  {currentStep >= slideCount - 1 ? "РџРѕСЃР»РµРґРЅРёР№ СЃР»Р°Р№Рґ" : "РЎР»РµРґСѓСЋС‰РёР№ СЃР»Р°Р№Рґ"}
                </button>
              </div>
            ) : null}
          </section>
        ) : (
          <section className="board-view">
            <GameBoard current={current} interactive={canControl} onSelectQuestion={openQuestion} played={played} />
          </section>
        )}
      </main>
    </div>
  );
}
