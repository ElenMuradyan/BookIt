export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const title = slug === "privacy" ? "Privacy notice" : "Terms of use";
  return (
    <main className="page">
      <article className="panel" style={{ maxWidth: 760 }}>
        <h1>{title}</h1>
        <p>
          BookIt collects the account details you enter so you can book services and buy products. Business workspaces only see customer contact details their staff are permitted to use.
          Payment card numbers are not collected in this frontend. Platform permissions in the browser are a preview; the future API must authorize every request.
        </p>
        <p>Gender is not requested. Date of birth is optional. You can update notification preferences and spending visibility from account settings.</p>
      </article>
    </main>
  );
}
