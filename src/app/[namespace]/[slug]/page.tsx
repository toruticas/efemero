import { notFound } from "next/navigation";
import { Viewer } from "@/components/viewer";
import { configurationStatus } from "@/server/config";
import { RESERVED_NAMES, SLUG_PATTERN, USERNAME_PATTERN } from "@/lib/protocol";
export const metadata = {
  title: "Abrir artefato",
  robots: { index: false, follow: false, noarchive: true },
};
export default async function ArtifactPage({
  params,
}: {
  params: Promise<{ namespace: string; slug: string }>;
}) {
  const { namespace, slug } = await params;
  if (
    !SLUG_PATTERN.test(slug) ||
    (namespace !== "a" &&
      (!USERNAME_PATTERN.test(namespace) || RESERVED_NAMES.has(namespace)))
  )
    notFound();
  return (
    <div className="viewer-page">
      <Viewer
        namespace={namespace}
        slug={slug}
        configured={configurationStatus().sharing}
      />
    </div>
  );
}
