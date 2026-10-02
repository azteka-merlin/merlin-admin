import React from "react";

const ZONE = "America/Sao_Paulo";
const STATUS = {
  scheduled: ["Programado", "info"],
  pending: ["Em processamento", "warning"],
  sent: ["Aceito pelo Resend", "success"],
  failed: ["Falhou", "danger"],
  missing: ["Sem registro", "danger"],
  covered: ["Envio de hoje dispensado", "muted"],
};

function localDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function offsetDate(date, days) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: ZONE, day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: ZONE, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function StatusBadge({ status }) {
  const [label, tone] = STATUS[status] || [status || "Desconhecido", "muted"];
  return <span className={`badge badge--${tone}`}>{label}</span>;
}

function Person({ name, email, licenseKey, onCopy }) {
  return <div className="billing-mail-person">
    <strong>{name || "Sem nome"}</strong>
    <span>{email || "E-mail indisponível"}</span>
    <div className="billing-mail-license">
      <code>{licenseKey || "Chave indisponível"}</code>
      {licenseKey && <button type="button" onClick={() => onCopy(licenseKey)} aria-label={`Copiar licença de ${name || email}`}>Copiar chave</button>}
    </div>
  </div>;
}

function Empty({ title, description }) {
  return <div className="empty-state"><h3>{title}</h3><p>{description}</p></div>;
}

export default function BillingNotificationsPage({ apiRequest, notify }) {
  const [date, setDate] = React.useState(localDate);
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [tab, setTab] = React.useState("schedule");
  const [query, setQuery] = React.useState("");
  const [retrying, setRetrying] = React.useState(null);

  async function refresh(targetDate = date) {
    setLoading(true);
    setError("");
    try {
      const payload = await apiRequest(`/panel-api/billing-notifications/dashboard?date=${encodeURIComponent(targetDate)}`);
      setData(payload);
    } catch (failure) {
      setError(failure.message || "Não foi possível carregar os avisos.");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    refresh(date);
  }, [date]);

  async function copyKey(key) {
    try {
      await navigator.clipboard.writeText(key);
      notify("Chave copiada.");
    } catch {
      notify("Não foi possível copiar a chave.");
    }
  }

  async function retry(item) {
    if (!window.confirm(`Reenviar o aviso para ${item.email}? A licença será conferida antes do envio.`)) return;
    setRetrying(item.notificationId || item.notification_id);
    try {
      await apiRequest(`/panel-api/billing-notifications/${item.notificationId || item.notification_id}/retry`, {
        method: "POST", mutate: true
      });
      notify("Aviso reenviado com sucesso.");
      await refresh(date);
    } catch (failure) {
      notify(failure.message || "Não foi possível reenviar o aviso.");
      await refresh(date);
    } finally {
      setRetrying(null);
    }
  }

  const schedule = data?.schedule || [];
  const history = data?.history || [];
  const upcoming = data?.upcoming || [];
  const search = query.trim().toLocaleLowerCase("pt-BR");
  const matches = (item) => !search || [item.name, item.email, item.licenseKey, item.license_key, item.reason]
    .filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(search);
  const shownSchedule = schedule.filter(matches);
  const shownHistory = history.filter(matches);
  const shownUpcoming = upcoming.filter(matches);
  const sent = history.filter((item) => item.status === "sent").length;
  const failed = schedule.filter((item) => item.status === "failed" || item.status === "missing").length;
  const pending = schedule.filter((item) => item.status === "scheduled" || item.status === "pending").length;
  const latestFailure = new Map(history.filter((item) => item.status === "failed" && item.notification_id)
    .map((item) => [item.notification_id, item.error_message]));
  const today = data?.today || localDate();
  const dateMin = offsetDate(today, -30);
  const dateMax = offsetDate(today, 14);

  return <section className="page billing-mail-page">
    <div className="page__header page__header--split">
      <div>
        <p className="eyebrow">Comunicação de cobrança</p>
        <h1>Avisos por e-mail</h1>
        <p>Veja quem deve receber, o motivo e o resultado de cada tentativa. Horários de Brasília. “Aceito” confirma o envio ao Resend, não a entrega na caixa de entrada.</p>
      </div>
      <button className="button button--ghost" onClick={() => refresh()} disabled={loading}>
        {loading ? "Atualizando..." : "Atualizar"}
      </button>
    </div>

    <div className="billing-mail-datebar panel">
      <div><strong>{date === today ? "Hoje" : formatDate(`${date}T12:00:00.000Z`)}</strong><small>Agenda e tentativas do dia</small></div>
      <div className="billing-mail-date-actions">
        <button type="button" className="button button--ghost button--sm" onClick={() => setDate(offsetDate(date, -1))} disabled={date <= dateMin}>Dia anterior</button>
        <input aria-label="Escolher dia dos avisos" type="date" value={date} min={dateMin} max={dateMax} onChange={(event) => setDate(event.target.value)} />
        <button type="button" className="button button--ghost button--sm" onClick={() => setDate(offsetDate(date, 1))} disabled={date >= dateMax}>Próximo dia</button>
        {date !== today && <button type="button" className="button button--ghost button--sm" onClick={() => setDate(today)}>Hoje</button>}
      </div>
    </div>

    {error && <div className="billing-mail-error" role="alert">{error}</div>}
    <div className="billing-mail-stats">
      <div className="stat-card"><span>Previstos no dia</span><strong>{schedule.length}</strong><small>09h e 19h</small></div>
      <div className="stat-card"><span>Aceitos pelo Resend</span><strong>{sent}</strong><small>Tentativas concluídas</small></div>
      <div className="stat-card"><span>Programados</span><strong>{pending}</strong><small>Aguardando horário ou processamento</small></div>
      <div className="stat-card"><span>Falhas / sem registro</span><strong>{failed}</strong><small>Precisam de atenção</small></div>
    </div>

    <div className="billing-mail-toolbar">
      <div className="billing-mail-tabs" role="tablist" aria-label="Seções de avisos">
        {[["schedule", "Agenda", schedule.length], ["history", "Histórico", history.length], ["upcoming", "Vencem em 7 dias", upcoming.length]].map(([key, label, count]) =>
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}>{label} <span>{count}</span></button>)}
      </div>
      <label className="field-shell field-shell--search"><span>Buscar por nome, e-mail ou chave</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pessoa ou licença" /></label>
    </div>

    {loading && !data ? <Empty title="Carregando avisos" description="Consultando a agenda e o histórico." /> : <>
      {tab === "schedule" && <section className="billing-mail-list" aria-label="Agenda de envio">
        <p className="billing-mail-hint">Esta lista reflete as licenças elegíveis agora. Um pagamento ou mudança de plano pode retirar um envio futuro.</p>
        {!shownSchedule.length ? <Empty title="Nenhum aviso previsto" description="Não há envios desta data com a busca atual." /> : shownSchedule.map((item) =>
          <article className="billing-mail-card" key={`${item.licenseId}-${item.reason}`}>
            <div className="billing-mail-card__top"><div><span className="billing-mail-time">{formatTime(item.scheduledAt)}</span><strong>{item.reason}</strong></div><StatusBadge status={item.status} /></div>
            <Person name={item.name} email={item.email} licenseKey={item.licenseKey} onCopy={copyKey} />
            <div className="billing-mail-card__foot"><span>Vence em {formatDate(item.expiresAt)} · {item.provider === "stripe" ? "Cartão sem renovação automática" : "Pix/manual"}</span>
              {item.sentAt && <span>Enviado às {formatTime(item.sentAt)}</span>}
              {item.status === "failed" && <button className="button button--primary button--sm" disabled={retrying === item.notificationId} onClick={() => retry(item)}>{retrying === item.notificationId ? "Reenviando..." : "Reenviar"}</button>}
            </div>
            {item.status === "covered" && <p className="billing-mail-covered-note">Nenhum e-mail será enviado neste horário: um aviso deste vencimento já foi aceito pelo Resend em {formatDate(item.previousSentAt)}, às {formatTime(item.previousSentAt)}.{item.nextScheduledAt ? ` Próximo aviso previsto: ${formatDate(item.nextScheduledAt)}, às ${formatTime(item.nextScheduledAt)}, se não houver renovação.` : ""}</p>}
            {item.status === "failed" && latestFailure.get(item.notificationId) && <details className="billing-mail-error-detail"><summary>Ver motivo técnico da falha</summary><code>{latestFailure.get(item.notificationId)}</code></details>}
          </article>)}
      </section>}

      {tab === "history" && <section className="billing-mail-list" aria-label="Histórico de envios">
        <p className="billing-mail-hint">Cada tentativa aparece separadamente. Um reenvio não apaga a falha original.</p>
        {!shownHistory.length ? <Empty title="Nenhuma tentativa registrada" description="Quando o job enviar ou tentar enviar avisos nesta data, o resultado aparecerá aqui." /> : shownHistory.map((item, index) =>
          <article className="billing-mail-card" key={item.attempt_id || `legacy-${item.notification_id}-${index}`}>
            <div className="billing-mail-card__top"><div><span className="billing-mail-time">{formatTime(item.finished_at || item.started_at)}</span><strong>{item.reason}</strong></div><StatusBadge status={item.status} /></div>
            <Person name={item.name} email={item.email} licenseKey={item.license_key} onCopy={copyKey} />
            <div className="billing-mail-card__foot"><span>{item.source === "cron" ? "Job automático" : item.source === "admin" ? "Ação no admin" : "Registro anterior"} · {formatDate(item.finished_at || item.started_at)}</span>
              {item.status === "failed" && item.current_status === "failed" && <button className="button button--primary button--sm" disabled={retrying === item.notification_id} onClick={() => retry(item)}>{retrying === item.notification_id ? "Reenviando..." : "Reenviar"}</button>}
            </div>
            {item.error_message && <details className="billing-mail-error-detail"><summary>Ver motivo técnico da falha</summary><code>{item.error_message}</code></details>}
          </article>)}
      </section>}

      {tab === "upcoming" && <section className="billing-mail-list" aria-label="Próximos vencimentos">
        <p className="billing-mail-hint">Licenças sem renovação automática e sem Pix antecipado pago. A lista considera os próximos 7 dias a partir de agora.</p>
        {!shownUpcoming.length ? <Empty title="Nenhum vencimento próximo" description="Não há licenças elegíveis nesta janela com a busca atual." /> : shownUpcoming.map((item) =>
          <article className="billing-mail-card" key={item.license_id}>
            <div className="billing-mail-card__top"><div><span className="billing-mail-time">{formatDate(item.expires_at)}</span><strong>Vencimento do acesso</strong></div><span className="badge badge--warning">{item.provider === "stripe" ? "Cartão" : "Pix/manual"}</span></div>
            <Person name={item.name} email={item.email} licenseKey={item.license_key} onCopy={copyKey} />
          </article>)}
      </section>}
    </>}
  </section>;
}
