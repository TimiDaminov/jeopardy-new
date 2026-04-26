"use client";

import { useRouter } from "next/navigation";
import { useJeopardySession } from "../lib/use-jeopardy-session";

export default function StartScreen() {
  const router = useRouter();
  const { createNewSession, isCreatingSession } = useJeopardySession({
    canEdit: true,
  });

  async function handleStart() {
    const slug = await createNewSession();

    if (!slug) return;

    router.push(`/?session=${encodeURIComponent(slug)}`);
  }

  return (
    <>
      <main className="start-screen">
        <section className="start-card">

          <h1>Своя игра</h1>

          <p>
           
          </p>

          <button
            className="start-button"
            disabled={isCreatingSession}
            onClick={handleStart}
            type="button"
          >
            {isCreatingSession ? "Создание..." : "Начать игру"}
          </button>
        </section>

        <footer className="start-logo">
          {/* Потом заменишь на <img src="/logo.png" alt="Logo" /> */}
          <img src="/logo.png" alt="Logo" className="start-logo-img" />
        </footer>
      </main>

      <style jsx global>{`
        html,
        body {
          margin: 0;
          min-height: 100%;
          background: #030303;
        }

        .start-screen {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px;
          color: #fff7b8;
          background:
            radial-gradient(circle at 50% 35%, rgba(255, 237, 74, 0.1), transparent 34%),
            radial-gradient(circle at 10% 10%, rgba(255, 237, 74, 0.08), transparent 28%),
            #030303;
          font-family:
            Georgia,
            "Times New Roman",
            serif;
        }

        .start-screen::before {
          content: "";
          position: absolute;
          inset: 20px;
          border: 1px solid rgba(255, 226, 0, 0.22);
          border-radius: 28px;
          pointer-events: none;
        }

        .start-card {
          position: relative;
          z-index: 1;
          width: min(100%, 560px);
          padding: 48px 44px;
          text-align: center;
          border-radius: 26px;
          border: 1px solid rgba(255, 226, 0, 0.28);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent),
            #070707;
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.04) inset,
            0 28px 90px rgba(0, 0, 0, 0.7),
            0 0 50px rgba(255, 226, 0, 0.06);
        }

        .start-card::before {
          content: "";
          position: absolute;
          left: 22px;
          top: 28px;
          bottom: 28px;
          width: 3px;
          border-radius: 999px;
          background: #ffe600;
          box-shadow: 0 0 18px rgba(255, 230, 0, 0.55);
        }

        .start-kicker {
          display: inline-flex;
          margin-bottom: 22px;
          padding: 9px 15px;
          border-radius: 999px;
          border: 1px solid rgba(255, 226, 0, 0.35);
          color: #fff24a;
          background: rgba(255, 226, 0, 0.055);
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.18em;
          font-family:
            Inter,
            Arial,
            sans-serif;
        }

        .start-card h1 {
          margin: 0;
          color: #fff24a;
          font-size: clamp(48px, 7vw, 82px);
          line-height: 0.95;
          font-weight: 900;
          letter-spacing: -0.04em;
          text-shadow:
            0 0 18px rgba(255, 226, 0, 0.28),
            0 2px 0 rgba(255, 255, 255, 0.12);
        }

        .start-card p {
          max-width: 420px;
          margin: 24px auto 36px;
          color: #fff7b8;
          opacity: 0.82;
          font-size: 20px;
          line-height: 1.55;
        }

        .start-button {
          width: 100%;
          min-height: 62px;
          border-radius: 18px;
          border: 1px solid rgba(255, 226, 0, 0.65);
          background: #050505;
          color: #fff24a;
          cursor: pointer;
          font-size: 20px;
          font-weight: 900;
          letter-spacing: 0.02em;
          box-shadow:
            inset 0 0 0 1px rgba(255, 255, 255, 0.04),
            0 0 22px rgba(255, 226, 0, 0.12);
          transition:
            transform 160ms ease,
            background 160ms ease,
            box-shadow 160ms ease,
            border-color 160ms ease;
        }

        .start-button:hover {
          transform: translateY(-2px);
          background: rgba(255, 226, 0, 0.08);
          border-color: #fff24a;
          box-shadow:
            inset 0 0 0 1px rgba(255, 255, 255, 0.06),
            0 0 34px rgba(255, 226, 0, 0.24);
        }

        .start-button:active {
          transform: translateY(0);
        }

        .start-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
        }

        .start-logo {
          position: absolute;
          left: 50%;
          bottom: 34px;
          transform: translateX(-50%);
          z-index: 1;
          color: rgba(255, 247, 184, 0.55);
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.24em;
          font-family:
            Inter,
            Arial,
            sans-serif;
        }

        .start-logo img {
          max-height: 46px;
          max-width: 190px;
          object-fit: contain;
          opacity: 0.82;
        }

        @media (max-width: 640px) {
          .start-screen {
            padding: 22px;
          }

          .start-screen::before {
            inset: 12px;
            border-radius: 22px;
          }

          .start-card {
            padding: 40px 26px;
            border-radius: 22px;
          }

          .start-card::before {
            left: 16px;
            top: 24px;
            bottom: 24px;
          }

          .start-card p {
            font-size: 16px;
          }

          .start-button {
            font-size: 18px;
          }
        }
      `}</style>
    </>
  );
}