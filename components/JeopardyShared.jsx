"use client";

import { useEffect, useRef, useState } from "react";
import { gameData, getQuestionId } from "../lib/game-data";

const SPECIAL_INTRO_TITLE_DELAY_MS = 240;
const SPECIAL_INTRO_META_DELAY_MS = 980;
const SPECIAL_INTRO_READY_DELAY_MS = 1650;

function getChoiceState(currentEntry, answerShown, selectedChoice, disabledChoices, choiceLabel) {
  if (!currentEntry) {
    return "";
  }

  if (answerShown && choiceLabel === currentEntry.question.correctChoice) {
    return " is-correct";
  }

  if (disabledChoices.includes(choiceLabel)) {
    return " is-wrong is-locked";
  }

  if (selectedChoice !== choiceLabel) {
    return "";
  }

  return choiceLabel === currentEntry.question.correctChoice ? " is-correct" : " is-wrong is-locked";
}

function getSpecialIntroKey(currentEntry) {
  if (!currentEntry) {
    return "";
  }

  const sequence = Array.isArray(currentEntry.question.sequence) ? currentEntry.question.sequence.join("-") : "";

  return `${currentEntry.category.title}:${currentEntry.question.value}:${sequence}`;
}

export function TeamScoreboard({
  teams,
  activeTeamId,
  activeTeamLabel = "Отвечает",
  className = "",
  interactive = false,
  onSelectTeam,
  awardValue = null,
  awardedTeamId = null,
}) {
  if (!teams.length) {
    return null;
  }

  return (
    <section aria-label="Команды и счет" className={`presentation-scoreboard${className ? ` ${className}` : ""}`}>
      {teams.map((team) => (
        <button
          className={`presentation-team-card${activeTeamId === team.id ? " is-answering" : ""}${interactive ? " is-clickable" : ""}${awardedTeamId === team.id ? " is-awarded" : ""}`}
          disabled={!interactive}
          key={team.id}
          onClick={interactive ? () => onSelectTeam?.(team.id) : undefined}
          style={{ "--team-color": team.color }}
          type="button"
        >
          <div className="presentation-team-accent" />
          <div className="presentation-team-copy">
            <div className="presentation-team-copy-main">
              <span className="presentation-team-name">{team.name}</span>

              <div className="presentation-team-badges">
                {activeTeamId === team.id ? <span className="presentation-team-badge">{activeTeamLabel}</span> : null}
                {awardValue ? (
                  <span className={`presentation-team-badge${awardedTeamId === team.id ? " is-awarded-badge" : ""}`}>
                    {`+${awardValue}`}
                  </span>
                ) : null}
              </div>
            </div>

            <span className="presentation-team-score">{team.score}</span>
          </div>
        </button>
      ))}
    </section>
  );
}

export function GameBoard({ played, current, onSelectQuestion, interactive = false, className = "" }) {
  const scoreHeaders = gameData.categories[0]?.questions.map((entry) => entry.value) ?? [];

  return (
    <div
      aria-label={interactive ? "Игровая таблица для выбора вопроса" : "Игровая таблица"}
      className={`board-grid board-grid-table${className ? ` ${className}` : ""}`}
    >
      <div className="corner-card">Категория</div>

      {scoreHeaders.map((value) => (
        <div className="score-header-card" key={`score-${value}`}>
          {value}
        </div>
      ))}

      {gameData.categories.flatMap((category, categoryIndex) => {
        const rowCells = [
          <div className="category-side-card" key={`category-${category.title}`}>
            {category.title}
          </div>,
        ];

        category.questions.forEach((item, questionIndex) => {
          const questionId = getQuestionId(categoryIndex, questionIndex);
          const isPlayed = Boolean(played[questionId]);
          const isActive =
            current?.categoryIndex === categoryIndex && current?.questionIndex === questionIndex;
          const classNames = `question-card${isPlayed ? " is-played" : ""}${isActive ? " is-active" : ""}`;

          if (interactive) {
            rowCells.push(
              <button
                className={classNames}
                key={questionId}
                onClick={() => onSelectQuestion?.(categoryIndex, questionIndex)}
                type="button"
              >
                <span className="question-value">{item.value}</span>
              </button>,
            );

            return;
          }

          rowCells.push(
            <div aria-hidden="true" className={classNames} key={questionId}>
              <span className="question-value">{item.value}</span>
            </div>,
          );
        });

        return rowCells;
      })}
    </div>
  );
}

export function ViewerStage({
  currentEntry,
  currentStep,
  currentSlidePath,
  showAnswerOptions,
  selectedChoice,
  disabledChoices = [],
  answerShown,
  onSelectChoice,
  activeTeam,
  timerLabel,
  timerStatusClass,
  className = "",
  slideClassName = "",
  questionControls = null,
  slideCounter = null,
  isSpecialIntroActive = false,
}) {
  const [slideFailed, setSlideFailed] = useState(false);
  const [specialIntroPhase, setSpecialIntroPhase] = useState("idle");
  const [specialIntroRun, setSpecialIntroRun] = useState(0);
  const specialIntroTimersRef = useRef([]);
  const isQuestionView = Boolean(currentEntry) && !answerShown && !isSpecialIntroActive;
  const specialIntroKey = getSpecialIntroKey(currentEntry);
  const isSpecialIntroTitleVisible =
    isSpecialIntroActive && specialIntroPhase !== "idle" && specialIntroPhase !== "boot";
  const isSpecialIntroMetaVisible =
    isSpecialIntroActive && (specialIntroPhase === "meta" || specialIntroPhase === "ready");
  const isSpecialIntroReady = isSpecialIntroActive && specialIntroPhase === "ready";

  function clearSpecialIntroTimers() {
    specialIntroTimersRef.current.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    specialIntroTimersRef.current = [];
  }

  useEffect(() => {
    setSlideFailed(false);
  }, [currentEntry, currentSlidePath, currentStep]);

  useEffect(() => {
    return () => {
      clearSpecialIntroTimers();
    };
  }, []);

  useEffect(() => {
    clearSpecialIntroTimers();

    if (!isSpecialIntroActive || !currentEntry) {
      setSpecialIntroPhase("idle");
      return undefined;
    }

    setSpecialIntroRun((currentValue) => currentValue + 1);
    setSpecialIntroPhase("boot");

    specialIntroTimersRef.current = [
      window.setTimeout(() => {
        setSpecialIntroPhase("title");
      }, SPECIAL_INTRO_TITLE_DELAY_MS),
      window.setTimeout(() => {
        setSpecialIntroPhase("meta");
      }, SPECIAL_INTRO_META_DELAY_MS),
      window.setTimeout(() => {
        setSpecialIntroPhase("ready");
      }, SPECIAL_INTRO_READY_DELAY_MS),
    ];

    return () => {
      clearSpecialIntroTimers();
    };
  }, [isSpecialIntroActive, specialIntroKey]);

  if (!currentEntry) {
    return null;
  }

  return (
    <div className={`viewer-stage-shell${className ? ` ${className}` : ""}`}>
      <div className="viewer-stage-area">
        {isSpecialIntroActive ? (
          <div
            className={`special-intro-stage special-intro-stage--${specialIntroPhase}`}
            key={`special-intro-${specialIntroRun}`}
          >
            <div className="special-intro-backdrop" aria-hidden="true">
              <span className="special-intro-flash" />
              <span className="special-intro-shutter special-intro-shutter--left" />
              <span className="special-intro-shutter special-intro-shutter--right" />
              <span className="special-intro-rail special-intro-rail--top" />
              <span className="special-intro-rail special-intro-rail--bottom" />
              <span className="special-intro-rail special-intro-rail--left" />
              <span className="special-intro-rail special-intro-rail--right" />
              <span className="special-intro-target special-intro-target--horizontal" />
              <span className="special-intro-target special-intro-target--vertical" />
            </div>

            <div className="special-intro-copy">
              <div className="special-intro-title-wrap">
                <span className={`special-intro-kicker${isSpecialIntroTitleVisible ? " is-visible" : ""}`}>
                  Спецвопрос
                </span>
                <h2 className={`special-intro-title${isSpecialIntroTitleVisible ? " is-visible" : ""}`}>
                  <span>Кот</span>
                  <span>в мешке</span>
                </h2>
              </div>


              <div className={`special-intro-meta${isSpecialIntroMetaVisible ? " is-visible" : ""}`}>
                <span className="special-intro-meta-chip">{currentEntry.category.title}</span>
                <span className="special-intro-meta-chip">{currentEntry.question.value}</span>
                {activeTeam ? (
                  <span
                    className="special-intro-meta-chip is-team is-assigned"
                    style={{ "--team-color": activeTeam.color }}
                  >
                    {`Вопрос получает ${activeTeam.name}`}
                  </span>
                ) : (
                  <span className="special-intro-meta-chip">Выберите команду</span>
                )}
              </div>

              {activeTeam ? (
                <div className={`special-intro-prompt${isSpecialIntroReady ? " is-visible" : ""}`}>
                  Нажмите пробел, чтобы открыть вопрос
                </div>
              ) : null}
            </div>
          </div>
        ) : isQuestionView ? (
          <div className={`question-stage${currentEntry.question.visuals.length ? " with-visuals" : ""}`}>
            <div className="question-copy">
              <div className="question-stage-status">
                <div className={`stage-timer${timerStatusClass}`}>
                  <span className="stage-status-label">Таймер</span>
                  <span className="stage-status-value">{timerLabel}</span>
                </div>

                {activeTeam ? (
                  <div className="stage-answering-team" style={{ "--team-color": activeTeam.color }}>
                    <span className="stage-status-label">Отвечает</span>
                    <span className="stage-status-value">{activeTeam.name}</span>
                  </div>
                ) : null}
              </div>

              {questionControls ? <div className="question-stage-controls">{questionControls}</div> : null}

              <h2 className="question-text">{currentEntry.question.text}</h2>
            </div>

            {currentEntry.question.visuals.length ? (
              <div className="question-visual-grid">
                {currentEntry.question.visuals.map((visualPath, visualIndex) => (
                  <div className="question-visual" key={visualPath}>
                    <img
                      alt={`Иллюстрация к вопросу ${currentEntry.question.value}, изображение ${visualIndex + 1}`}
                      src={visualPath}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className={`slide-frame${slideClassName ? ` ${slideClassName}` : ""}`}>
            {slideCounter ? <div className="slide-counter">{slideCounter}</div> : null}

            {!slideFailed ? (
              <img
                alt={`Слайд ${currentStep + 1}`}
                className="slide-image"
                onError={() => setSlideFailed(true)}
                src={currentSlidePath}
              />
            ) : null}

            {slideFailed ? (
              <div className="slide-fallback">
                <div>
                  <h3>Слайд не найден</h3>
                  <p>
                    Проверьте папку <code>public/assets/slides</code>.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {showAnswerOptions ? (
        <div className="answer-panel">
          <div className="answer-panel-header">
            <span className="answer-panel-title">Варианты ответа</span>
          </div>

          <div className="answer-grid">
            {currentEntry.question.choices.map((choice) => (
              <button
                className={`answer-option${getChoiceState(
                  currentEntry,
                  answerShown,
                  selectedChoice,
                  disabledChoices,
                  choice.label,
                )}`}
                disabled={!onSelectChoice || disabledChoices.includes(choice.label)}
                key={choice.label}
                onClick={() => onSelectChoice?.(choice.label)}
                type="button"
              >
                <span className="answer-option-label">{choice.label}</span>
                <span className="answer-option-text">{choice.text}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
