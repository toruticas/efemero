import { RevokeForm } from "@/components/revoke-form";
export const metadata = { title: "Revogar artefato" };
export default function RevokePage() {
  return (
    <div className="viewer-page">
      <RevokeForm />
    </div>
  );
}
