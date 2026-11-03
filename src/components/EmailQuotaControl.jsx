import React from "react";

const number = (value) => new Intl.NumberFormat("pt-BR").format(value);
const periodLabel = { daily: "Últimas 24h", monthly: "Neste mês", credits: "Saldo" };

function Quota({ provider, quota }) {
  const label = provider === "brevo" && quota.period === "daily" ? "Hoje" : periodLabel[quota.period];
  const unlimited = quota.remaining === null && quota.limit === null && quota.used !== null;
  return <div className="email-quota__row">
    <dt>{label}</dt>
    <dd><strong>{unlimited ? "Sem limite" : `${number(quota.remaining)} disponíveis`}</strong>
      {quota.limit !== null && <small>{number(quota.used)} de {number(quota.limit)} usados</small>}
    </dd>
  </div>;
}

export default function EmailQuotaControl({ apiRequest }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState("");
  const version = React.useRef(0);
  const panelId = React.useId();
  React.useEffect(() => () => { version.current += 1; }, []);

  async function refresh() {
    const current = ++version.current;
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest("/panel-api/email/quotas");
      if (!Array.isArray(response?.providers) || !response.providers.length) throw new Error("Não foi possível consultar a cota.");
      if (current === version.current) setData(response);
    } catch (failure) {
      if (current === version.current) setError(failure.message || "Não foi possível consultar a cota.");
    } finally {
      if (current === version.current) setLoading(false);
    }
  }

  function toggle() {
    if (!open) refresh();
    setOpen(!open);
  }

  return <div className="email-quota" onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
    <button type="button" className="button button--ghost button--sm" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
      {open ? "Ocultar cota" : "Consultar cota"}
    </button>
    {open && <section className="email-quota__panel" id={panelId} aria-label="Cota de e-mails" aria-busy={loading}>
      <div className="email-quota__heading"><strong>Cota de e-mails</strong>
        <button type="button" className="button button--ghost button--sm" onClick={refresh} disabled={loading}>{loading ? "Consultando..." : "Atualizar"}</button>
      </div>
      {error && <p role="alert" className="email-quota__error">{error}</p>}
      {loading && !data && <p className="email-quota__hint" role="status">Consultando Brevo e Resend...</p>}
      {data && <div className="email-quota__providers" style={loading || error ? { opacity: 0.6 } : undefined}>
        {data.providers.map((provider) => <article className="email-quota__provider" key={provider.provider}>
          <div className="email-quota__provider-title"><strong>{provider.name}</strong><small>{provider.role}</small></div>
          {provider.status === "ok" ? <dl>{provider.quotas.map((quota) => <Quota key={quota.period} provider={provider.provider} quota={quota} />)}</dl>
            : <p className="email-quota__hint">{provider.message || "Cota indisponível."}</p>}
          <a href={provider.dashboardUrl} target="_blank" rel="noopener noreferrer">Abrir painel ↗</a>
        </article>)}
      </div>}
      {data?.checkedAt && <p className="email-quota__hint" aria-live="polite">{error ? "Última consulta válida" : "Consultado"} às {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(data.checkedAt))} · Brasília</p>}
    </section>}
  </div>;
}
