import React from "react";
import { formatDate, getStatus } from "../lib/admin-ui";

const PERIODS = [
  ["allTime", "Total"],
  ["cycle", "Ciclo atual"],
  ["month", "30 dias"],
  ["week", "7 dias"],
];

function UsageCards({ summary }) {
  const cards = [
    ["7 dias", summary?.week],
    ["30 dias", summary?.month],
    ["Ciclo atual", summary?.cycle],
  ];
  return <div className="stats-grid">
    {cards.map(([label, usage]) => <article className="stat-card" key={label}>
      <span>{label}</span>
      <strong>{usage?.total || 0}</strong>
      <small>{usage?.normal || 0} normal · {usage?.premium || 0} Premium</small>
    </article>)}
    <article className="stat-card">
      <span>Usuários com uso real</span>
      <strong>{summary?.usersWithRealUsage || 0}</strong>
      <small>de {summary?.licenses || 0} licenças normais</small>
    </article>
  </div>;
}

function UserTable({ users, period, emptyText }) {
  if (!users.length) return <div className="empty-state"><h3>Nenhum usuário encontrado</h3><p>{emptyText}</p></div>;
  return <div className="table-wrap"><table className="data-table">
    <thead><tr><th>Usuário</th><th>Licença</th><th>Plano / cobrança</th><th>Status</th><th>Normal</th><th>Premium</th><th>Uso</th></tr></thead>
    <tbody>{users.map((user) => {
      const usage = user.usage[period];
      const status = getStatus(user);
      return <tr key={user.licenseId}>
        <td><strong>{user.name}</strong><small>{user.licenseKey}</small></td>
        <td><span>{formatDate(user.expiresAt)}</span><small>{period === "cycle" && user.cycleStartedAt ? `Ciclo: ${formatDate(user.cycleStartedAt)}` : ""}</small></td>
        <td><span className="badge badge--muted">{user.tier}</span><small>{user.autoRenewingCard ? "Cartão · renovação automática" : `${user.source} · ${user.billingStatus}`}</small></td>
        <td><span className={`badge badge--${status.tone}`}>{status.shortLabel}</span></td>
        <td>{usage.normal}</td><td>{usage.premium}</td><td><strong>{usage.total}</strong></td>
      </tr>;
    })}</tbody>
  </table></div>;
}

export default function UsageBiPage({ analytics, loading, loadAnalytics }) {
  const [period, setPeriod] = React.useState("month");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [expiryDays, setExpiryDays] = React.useState("30");
  const [includeAutoRenewing, setIncludeAutoRenewing] = React.useState(false);
  const query = search.trim().toLowerCase();
  const users = (analytics?.users || []).filter((user) => {
    const matchesSearch = !query || [user.name, user.licenseKey, user.tier, user.billingStatus].join(" ").toLowerCase().includes(query);
    const matchesStatus = statusFilter === "all" || getStatus(user).key === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const ranked = [...users].sort((left, right) => right.usage[period].total - left.usage[period].total || right.usage.allTime.total - left.usage.allTime.total);

  function refresh() {
    loadAnalytics({ expiryDays: Number(expiryDays), includeAutoRenewing });
  }

  return <section className="page">
    <div className="page__header page__header--split">
      <div><p className="eyebrow">BI de uso</p><h1>Uso real do Merlin, sem usar login como pontuação.</h1><p>Contabiliza somente ativações normais e Premium concluídas.</p></div>
      <button className="button button--ghost" onClick={refresh} disabled={loading}>{loading ? "Atualizando..." : "Atualizar dados"}</button>
    </div>
    <UsageCards summary={analytics?.summary} />
    <section className="panel">
      <div className="filters filters--audit">
        <label className="field-shell field-shell--search"><span>Buscar usuário</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, chave, plano ou cobrança" /></label>
        <label className="field-shell"><span>Ranking por</span><select value={period} onChange={(event) => setPeriod(event.target.value)}>{PERIODS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="field-shell"><span>Status da licença</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Todos</option><option value="active">Ativa</option><option value="soon">Expira em breve</option><option value="expired">Expirada</option><option value="revoked">Revogada</option></select></label>
      </div>
      {loading ? <div className="empty-state"><h3>Calculando uso</h3><p>Consultando ativações reais por licença.</p></div> : <UserTable users={ranked} period={period} emptyText="Ainda não há ativações concluídas para esta busca." />}
    </section>
    <section className="panel">
      <div className="page__header page__header--split"><div><p className="eyebrow">Risco de vencimento</p><h2>Quem vence em breve e ainda usa o sistema</h2><p>Cartões com renovação automática ativa ficam excluídos por padrão.</p></div></div>
      <div className="filters filters--audit">
        <label className="field-shell"><span>Janela de vencimento</span><select value={expiryDays} onChange={(event) => setExpiryDays(event.target.value)}><option value="7">Próximos 7 dias</option><option value="30">Próximos 30 dias</option><option value="60">Próximos 60 dias</option></select></label>
        <label className="check-field"><input type="checkbox" checked={includeAutoRenewing} onChange={(event) => setIncludeAutoRenewing(event.target.checked)} /><span>Incluir cartão com renovação automática</span></label>
        <button className="button button--ghost button--sm" onClick={refresh} disabled={loading}>Aplicar</button>
      </div>
      <UserTable users={analytics?.expiringUsers || []} period={period} emptyText="Nenhuma licença nesta janela com os filtros atuais." />
    </section>
  </section>;
}
