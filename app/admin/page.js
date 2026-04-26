import JeopardyAdmin from "../../components/JeopardyAdmin";

export default async function AdminPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;

  return <JeopardyAdmin sessionSlug={resolvedSearchParams?.session} />;
}
