import { getI18n } from "@/lib/i18n/server";
import { notFound } from "next/navigation";
import { Viewer } from "@/components/viewer";
import { configurationStatus } from "@/server/config";
import { RESERVED_NAMES, SLUG_PATTERN, USERNAME_PATTERN } from "@/lib/protocol";
export async function generateMetadata() {
  const { t } = await getI18n();
  return {
    title: t("Open artifact"),
    robots: { index: false, follow: false, noarchive: true },
  };
}
export default async function ArtifactPage({
  params,
}: {
  params: Promise<{ namespace: string; slug: string }>;
}) {
  const { t } = await getI18n();
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
