import JeopardyGame from "../components/JeopardyGame";
import StartScreen from "../components/StartScreen";

export default async function HomePage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const sessionSlug = resolvedSearchParams?.session;

  if (!sessionSlug) {
    return <StartScreen />;
  }

  return <JeopardyGame sessionSlug={sessionSlug} />;
}