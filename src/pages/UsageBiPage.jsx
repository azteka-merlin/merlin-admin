import React from "react";
import { formatDate, getStatus } from "../lib/admin-ui";

const PERIODS = [["allTime", "Todo o período"], ["month", "Últimos 30 dias"], ["week", "Últimos 7 dias"], ["cycle", "Ciclo rastreável"]];

function UsageBreakdown({ usage, muted = false }) {
  if (muted) return <span className="usage-value usage-value--muted">Ciclo não rastreável</span>;
  return <div className="usage-value"><strong>{usage?.total || 0}</strong><small>{usage?.normal || 0} normal · {usage?.premium || 0} Premium</small></div>;
}

function UsageCards({ summary }) {
  const cards = [["Ativações nos últimos 7 dias", summary?.week], ["Ativações nos últimos 30 dias", summary?.month]];
  return <>
    <div className="stats-grid usage-stats-grid">
      {cards.map(([label, usage]) => <article className="stat-card" key={label}><span>{label}</span><UsageBreakdown usage={usage} /></article>)}
      <article className="stat-card"><span>Usuários com uso real</span><strong>{summary?.usersWithRealUsage || 0}</strong><small>de {summary?.licenses || 0} licenças normais</small></article>
    </div>
    <aside className="usage-cycle-note">
      <div><p className="eyebrow">Uso no ciclo de cobrança</p><UsageBreakdown usage={summary?.cycle} /></div>
      <p>Considera somente licenças cujo início de ciclo foi registrado. As datas variam por cliente, então este total não é comparável diretamente com os últimos 30 dias.</p>
      <small>{summary?.cycleTrackedLicenses || 0} de {summary?.licenses || 0} licenças têm ciclo rastreável.</small>
    </aside>
  </>;
}

function expiryText(expiresAt, status) {
  if (status.key === "revoked") return "Licença revogada";
  const diff = Math.ceil((new Date(`${expiresAt.slice(0, 10)}T00:00:00`).getTime() - Date.now()) / 86400000);
  if (diff < 0) return `Expirou há ${Math.abs(diff)} dia${Math.abs(diff) === 1 ? "" : "s"}`;
  if (diff === 0) return "Expira hoje";
  return `Vence em ${diff} dia${diff === 1 ? "" : "s"}`;
}

function UserTable({ users, period, emptyText, label }) {
  if (!users.length) return <div className="empty-state"><h3>Nenhum usuário encontrado</h3><p>{emptyText}</p></div>;
  return <div className="usage-table-wrap"><table className="usage-table">
    <caption>{label}</caption>
    <thead><tr><th>Usuário</th><th>Plano e cobrança</th><th>Validade</th><th>Status</th><th>Uso</th></tr></thead>
    <tbody>{users.map((user) => {
      const status = getStatus(user);
      const cycleUnavailable = period === "cycle" && !user.cycleTracked;
      return <tr key={user.licenseId}>
        <td><div className="usage-user"><strong>{user.name}</strong><small>{user.licenseKey}</small></div></td>
        <td><div className="usage-plan"><span className="badge badge--muted">{user.tier}</span><small>{user.autoRenewingCard ? "Cartão · renovação automática" : `${user.source} · ${user.billingStatus}`}</small></div></td>
        <td><div className="usage-validity"><strong>{expiryText(user.expiresAt, status)}</strong><small>{formatDate(user.expiresAt)}{user.cycleTracked ? ` · ciclo desde ${formatDate(user.cycleStartedAt)}` : ""}</small></div></td>
        <td><span className={`badge badge--${status.tone}`}>{status.shortLabel}</span></td>
        <td><UsageBreakdown usage={user.usage[period]} muted={cycleUnavailable} /></td>
      </tr>;
    })}</tbody>
  </table></div>;
}

export default function UsageBiPage({ analytics, loading, loadAnalytics, period, setPeriod, search, setSearch, statusFilter, setStatusFilter, expiryDays, setExpiryDays, includeAutoRenewing, setIncludeAutoRenewing }) {
  const query = search.trim().toLowerCase();
  const users = (analytics?.users || []).filter((user) => {
    const matchesSearch = !query || [user.name, user.licenseKey, user.tier, user.billingStatus].join(" ").toLowerCase().includes(query);
    return matchesSearch && (statusFilter === "all" || getStatus(user).key === statusFilter);
  });
  const ranked = [...users].sort((left, right) => right.usage[period].total - left.usage[period].total || right.usage.month.total - left.usage.month.total || right.usage.allTime.total - left.usage.allTime.total);
  const refresh = () => loadAnalytics({ expiryDays: Number(expiryDays), includeAutoRenewing });

  return <section className="page usage-bi-page">
    <div className="page__header page__header--split"><div><p className="eyebrow">BI de uso</p><h1>Uso real do Merlin</h1><p>Contabiliza apenas ativações normais e Premium concluídas; logins não entram na pontuação.</p></div><button className="button button--ghost" onClick={refresh} disabled={loading}>{loading ? "Atualizando..." : "Atualizar dados"}</button></div>
    <UsageCards summary={analytics?.summary} />
    <section className="panel usage-panel">
      <div className="usage-panel__heading"><div><p className="eyebrow">Ranking geral</p><h2>Quem mais usa a plataforma</h2></div><p>Use os filtros para localizar e comparar licenças.</p></div>
      <div className="filters filters--audit"><label className="field-shell field-shell--search"><span>Buscar usuário</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, chave, plano ou cobrança" /></label><label className="field-shell"><span>Ranking por</span><select value={period} onChange={(event) => setPeriod(event.target.value)}>{PERIODS.map(([key, itemLabel]) => <option key={key} value={key}>{itemLabel}</option>)}</select></label><label className="field-shell"><span>Status da licença</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Todos</option><option value="active">Ativa</option><option value="soon">Expira em breve</option><option value="expired">Expirada</option><option value="revoked">Revogada</option></select></label></div>
      {loading ? <div className="empty-state"><h3>Calculando uso</h3><p>Consultando ativações reais por licença.</p></div> : <UserTable users={ranked} period={period} label="Ranking de uso por licença" emptyText="Ainda não há ativações concluídas para esta busca." />}
    </section>
    <section className="panel usage-panel">
      <div className="usage-panel__heading"><div><p className="eyebrow">Oportunidades de renovação</p><h2>Quem vence em breve e ainda usa o sistema</h2></div><p>O ranking desta lista usa sempre os últimos 30 dias.</p></div>
      <div className="filters filters--audit"><label className="field-shell"><span>Janela de vencimento</span><select value={expiryDays} onChange={(event) => setExpiryDays(event.target.value)}><option value="7">Próximos 7 dias</option><option value="30">Próximos 30 dias</option><option value="60">Próximos 60 dias</option></select></label><label className="check-field"><input type="checkbox" checked={includeAutoRenewing} onChange={(event) => setIncludeAutoRenewing(event.target.checked)} /><span>Incluir cartão com renovação automática</span></label><button className="button button--ghost button--sm" onClick={refresh} disabled={loading}>Aplicar</button></div>
      <UserTable users={analytics?.expiringUsers || []} period="month" label="Licenças próximas do vencimento, ordenadas pelo uso em 30 dias" emptyText="Nenhuma licença nesta janela com os filtros atuais." />
    </section>
  </section>;
}
