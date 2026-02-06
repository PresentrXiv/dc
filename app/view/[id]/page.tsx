import ViewPosterClient from './ViewPosterClient';

export default async function ViewPosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ViewPosterClient posterId={id} />;
}
