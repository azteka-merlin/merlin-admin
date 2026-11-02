import React from "react";
import { formatDateTimeBrt as formatDateTime } from "../lib/admin-ui";
import { contactPhone } from "../lib/premium-admin";

const MAIL_STATUS = {
  scheduled: ["Programado", "info"], pending: ["Aguardando envio", "info"], sending: ["Enviando", "warning"],
  processing: ["Enviando", "warning"], sent: ["Enviado", "success"], failed: ["Falhou", "danger"],
  canceled: ["Cancelado", "muted"], cancelled: ["Cancelado", "muted"]
};

export default function PremiumInterestsPanel({ apiRequest, mode }) {
  const isWishlist = mode === "wishlist";
  const [games, setGames] = React.useState([]);
  const [appId, setAppId] = React.useState("");
  const [items, setItems] = React.useState([]);
  const [cursor, setCursor] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const requestVersion = React.useRef(0);

  React.useEffect(() => {
    let current = true;
    apiRequest("/panel-api/premium/games").then((payload) => { if (current) setGames(payload.games || []); }).catch(() => {});
    return () => { current = false; };
  }, [apiRequest]);

  async function refresh(beforeId = null) {
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (appId) params.set("appId", appId);
      if (beforeId) params.set("beforeId", String(beforeId));
      const payload = await apiRequest(`/panel-api/premium/${isWishlist ? "wishlist" : "notifications"}?${params}`);
      if (version !== requestVersion.current) return;
      const received = isWishlist ? payload.wishes || [] : payload.notifications || [];
      setItems((previous) => beforeId ? [...previous, ...received.filter((item) => !previous.some((old) => old.id === item.id))] : received);
      setCursor(payload.nextBeforeId || null);
    } catch (failure) {
      if (version === requestVersion.current) setError(failure.message || "Não foi possível carregar os dados.");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }

  React.useEffect(() => {
    setItems([]);
    setCursor(null);
    refresh();
    return () => { requestVersion.current += 1; };
  }, [appId, mode]);

  return <section className="premium-interests-panel">
    <div className="page__header page__header--split">
      <div><h2>{isWishlist ? "Lista de desejos" : "E-mails Premium"}</h2>
        <p>{isWishlist ? "Veja quem quer cada jogo e os contatos que a pessoa autorizou para falar sobre ele." : "Acompanhe avisos de lançamento e da próxima ativação disponível. Horários de Brasília."}</p></div>
      <button className="button button--ghost" type="button" disabled={loading} onClick={() => refresh()}>{loading ? "Atualizando..." : "Atualizar"}</button>
    </div>
    <div className="filters"><label className="field-shell premium-interests-filter"><span>Jogo</span>
      <select value={appId} onChange={(event) => setAppId(event.target.value)}><option value="">Todos os jogos</option>
        {games.map((game) => <option key={game.appId} value={game.appId}>{game.name || `App ${game.appId}`}</option>)}
      </select></label></div>
    {error && <div className="billing-mail-error" role="alert">{error} <button className="button button--ghost button--sm" onClick={() => refresh()} disabled={loading}>Tentar novamente</button></div>}
    <p className="billing-mail-hint" aria-live="polite">{loading && !items.length ? "Carregando..." : `${items.length} ${isWishlist ? "interessados exibidos" : "avisos exibidos"}`}</p>
    {!loading && !error && !items.length ? <div className="empty-state"><h3>{isWishlist ? "Nenhum interesse registrado" : "Nenhum aviso registrado"}</h3><p>{isWishlist ? "Os pedidos feitos no launcher aparecerão aqui." : "Os avisos programados e enviados aparecerão aqui."}</p></div> : <div className="billing-mail-list" aria-busy={loading}>
      {items.map((item) => isWishlist ? <article className="billing-mail-card" key={item.id}>
        <div className="billing-mail-card__top"><strong>{item.gameName || `App ${item.appId}`}</strong><span className={`badge badge--${item.comingSoon ? "info" : "success"}`}>{item.comingSoon ? "Em breve" : "Disponível"}</span></div>
        <div className="billing-mail-person"><strong>{item.licenseName || `Licença #${item.licenseId}`}</strong><a href={`mailto:${item.email}`}>{item.email}</a>
          {contactPhone(item) && <span>Telefone: <a href={`tel:${contactPhone(item).replace(/[^+0-9]/g, "")}`}>{contactPhone(item)}</a></span>}</div>
        <div className="billing-mail-card__foot"><span>Adicionado em {formatDateTime(item.createdAt)}</span>
          {contactPhone(item) && <span>Contato autorizado apenas sobre este jogo</span>}</div>
      </article> : <article className="billing-mail-card" key={item.id}>
        <div className="billing-mail-card__top"><strong>{item.gameName || "Jogo removido"}</strong><span className={`badge badge--${(MAIL_STATUS[item.status] || ["Status desconhecido", "muted"])[1]}`}>{(MAIL_STATUS[item.status] || ["Status desconhecido"])[0]}</span></div>
        <div className="billing-mail-person"><strong>{item.kind === "game_available" ? "Jogo disponível" : "Próxima ativação disponível"}</strong><span>{item.email}</span></div>
        <div className="billing-mail-card__foot"><span>{item.sentAt ? `Enviado em ${formatDateTime(item.sentAt)}` : `Programado para ${formatDateTime(item.scheduledAt)}`}</span></div>
        {item.lastError && <details className="billing-mail-error-detail"><summary>Ver motivo da falha</summary><code>{item.lastError}</code></details>}
      </article>)}
    </div>}
    {cursor && <button type="button" className="button button--ghost premium-interests-more" disabled={loading} onClick={() => refresh(cursor)}>{loading ? "Carregando..." : "Carregar mais"}</button>}
  </section>;
}
