import React, { useEffect, useMemo, useState } from "react";
import Modal from "../components/Modal";

const GAME_REQUEST_FIXED_QUESTION = "Qual jogo você quer no Premium?";

function createEmptyPollDraft() {
  return {
    mode: "create",
    id: null,
    type: "basic",
    question: "",
    options: [{ label: "" }, { label: "" }, { label: "" }],
    contributionOptions: [
      { minAmount: "0", maxAmount: "10" },
      { minAmount: "11", maxAmount: "20" },
      { minAmount: "21", maxAmount: "30" },
    ],
  };
}

function createPollDraft(entry) {
  if (!entry) return createEmptyPollDraft();
  const empty = createEmptyPollDraft();
  return {
    ...empty,
    mode: "edit",
    id: entry.id,
    type: entry.type || "basic",
    question: entry.question || "",
    options: empty.options.map((option, index) => {
      const existing = entry.options?.[index];
      return { ...option, label: existing?.label || "" };
    }),
    contributionOptions: empty.contributionOptions.map((option, index) => {
      const existing = entry.contributionOptions?.filter((item) =>
        item.minAmount !== null || item.maxAmount !== null
      )?.[index];
      return {
        ...option,
        minAmount: existing?.minAmount ?? option.minAmount,
        maxAmount: existing?.maxAmount ?? option.maxAmount,
      };
    }),
  };
}

function normalizePollPayload(draft) {
  const type = draft.type === "game_request" ? "game_request" : "basic";
  const question = type === "game_request" ? GAME_REQUEST_FIXED_QUESTION : String(draft.question || "").trim();
  if (!question) throw new Error("Informe a pergunta da enquete.");

  const options = draft.options
    .map((option) => ({ label: String(option.label || "").trim() }))
    .filter((option) => option.label);

  if (options.length < 2 || options.length > 3) {
    throw new Error("Informe 2 ou 3 alternativas.");
  }

  const payload = { type, question, options };

  if (payload.type === "game_request") {
    const rangedOptions = draft.contributionOptions
      .map((option, index) => {
        const minAmount = String(option.minAmount ?? "").trim();
        const maxAmount = String(option.maxAmount ?? "").trim();
        return {
          label: `Faixa ${index + 1}`,
          minAmount: minAmount === "" ? null : Number(minAmount),
          maxAmount: maxAmount === "" ? null : Number(maxAmount),
        };
      })
      .filter((option) => option.minAmount !== null && option.maxAmount !== null)
      .filter((option) => Number.isFinite(option.minAmount) && Number.isFinite(option.maxAmount))
      .filter((option) => option.minAmount >= 0 && option.maxAmount >= option.minAmount)
      .filter((option, index, list) =>
        list.findIndex((candidate) => candidate.minAmount === option.minAmount && candidate.maxAmount === option.maxAmount) === index
      );

    if (rangedOptions.length < 1 || rangedOptions.length > 3) {
      throw new Error("Informe de 1 a 3 faixas válidas de contribuição.");
    }

    payload.contributionOptions = [
      { label: "__none__", minAmount: null, maxAmount: null },
      ...rangedOptions,
    ];
  }

  return payload;
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatContribution(option) {
  if (option.minAmount === null && option.maxAmount === null) return "Sem contribuição";
  const formatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
  if (option.minAmount !== null && option.maxAmount !== null) {
    return `${formatter.format(option.minAmount)} a ${formatter.format(option.maxAmount)}`;
  }
  return option.label;
}

function basicOptionPlaceholder(index) {
  if (index === 0) return "Sim";
  if (index === 1) return "Não";
  return "Talvez";
}

function requestGamePlaceholder(index) {
  if (index === 0) return "Assassin's Creed Black Flag Resynced";
  if (index === 1) return "Sword Art Online: Fractured Daydream";
  return "Pragmata";
}

function displayPollQuestion(entry) {
  return entry?.type === "game_request" ? GAME_REQUEST_FIXED_QUESTION : entry?.question;
}

function pollTypeLabel(type) {
  return type === "game_request" ? "Pedido de jogo" : "Básica";
}

function pollStatusLabel(status) {
  if (status === "open") return "Aberta";
  if (status === "closed") return "Fechada";
  return "Rascunho";
}

function pollStatusTone(status) {
  if (status === "open") return "badge--emerald";
  if (status === "closed") return "badge--muted";
  return "badge--warning";
}

function maskLicenseKey(value) {
  const text = String(value || "");
  if (!text) return "--";
  const parts = text.split("-");
  if (parts.length >= 4) return `${parts[0]}-${parts[1]}-XXXX-${parts[parts.length - 1]}`;
  return text.length > 8 ? `${text.slice(0, 6)}...${text.slice(-4)}` : text;
}

function leadingOption(options = []) {
  return options.reduce((leader, option) => {
    if (!leader || (option.votes || 0) > (leader.votes || 0)) return option;
    return leader;
  }, null);
}

export default function PollsPage({
  polls,
  loadingPolls,
  pollSearch,
  setPollSearch,
  loadPolls,
  loadPollResults,
  savePoll,
  setPollStatus,
  deletePoll,
  busyAction,
  notify,
}) {
  const [activeModal, setActiveModal] = useState(null);
  const [draft, setDraft] = useState(createEmptyPollDraft());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState("");
  const [resultsData, setResultsData] = useState(null);
  const [expandedOptions, setExpandedOptions] = useState({});

  const filteredPolls = useMemo(() => {
    const query = pollSearch.trim().toLowerCase();
    return polls.filter((poll) => {
      if (!query) return true;
      return [
        displayPollQuestion(poll),
        poll.type,
        poll.status,
        pollTypeLabel(poll.type),
        ...(poll.options || []).map((option) => option.label),
      ].some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [pollSearch, polls]);

  const saveBusy = busyAction === "save-poll";
  const statusBusy = busyAction === "poll-status";
  const deleteBusy = busyAction === "delete-poll";

  function openCreateModal() {
    setDraft(createEmptyPollDraft());
    setActiveModal("upsert");
  }

  function openEditModal(entry) {
    setDraft(createPollDraft(entry));
    setActiveModal("upsert");
  }

  async function handleSave() {
    try {
      await savePoll(draft.mode, draft.id, normalizePollPayload(draft));
      setActiveModal(null);
      setDraft(createEmptyPollDraft());
      notify(draft.mode === "edit" ? "Enquete atualizada." : "Enquete criada.");
    } catch (error) {
      notify(error.message || "Não foi possível salvar a enquete.");
    }
  }

  async function handleStatus(entry, status) {
    try {
      await setPollStatus(entry.id, status);
      notify(status === "open" ? "Enquete aberta." : "Enquete fechada.");
    } catch (error) {
      notify(error.message || "Não foi possível alterar o status da enquete.");
    }
  }

  async function handleDelete() {
    if (!deleteTarget?.id) return;
    try {
      await deletePoll(deleteTarget.id);
      setDeleteTarget(null);
      setActiveModal(null);
      notify("Enquete removida.");
    } catch (error) {
      notify(error.message || "Não foi possível remover a enquete.");
    }
  }

  async function openResults(entry) {
    setResultsOpen(true);
    setResultsData(null);
    setResultsError("");
    setExpandedOptions({});
    setResultsLoading(true);
    try {
      const payload = await loadPollResults(entry.id);
      setResultsData(payload);
    } catch (error) {
      setResultsError(error.message || "Não foi possível carregar os resultados.");
    } finally {
      setResultsLoading(false);
    }
  }

  function closeResults() {
    setResultsOpen(false);
    setResultsData(null);
    setResultsError("");
    setExpandedOptions({});
  }

  useEffect(() => {
    if (!resultsOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeResults();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [resultsOpen]);

  const resultPoll = resultsData?.poll;
  const resultOptions = resultsData?.options || [];
  const leader = resultPoll?.leader || leadingOption(resultOptions);

  return (
    <section className="page page--polls">
      <div className="page__header page__header--split">
        <div>
          <p className="eyebrow">Enquetes</p>
          <h1>Crie enquetes para feedback, escolha de jogos e interesse em contribuições.</h1>
        </div>
        <div className="page__actions">
          <button className="button button--ghost" onClick={loadPolls} disabled={loadingPolls}>
            {loadingPolls ? "Atualizando..." : "Atualizar lista"}
          </button>
          <button className="button button--primary" onClick={openCreateModal}>
            + Nova enquete
          </button>
        </div>
      </div>

      <section className="panel panel--audit">
        <div className="filters">
          <label className="field-shell field-shell--search">
            <span>Buscar</span>
            <input
              value={pollSearch}
              onChange={(event) => setPollSearch(event.target.value)}
              placeholder="Buscar por pergunta, tipo ou alternativa..."
            />
          </label>
        </div>

        {loadingPolls ? (
          <div className="empty-state">
            <h3>Carregando enquetes</h3>
            <p>Buscando a configuração atual das enquetes.</p>
          </div>
        ) : !filteredPolls.length ? (
          <div className="empty-state">
            <h3>Nenhuma enquete criada ainda.</h3>
            <p>Crie uma enquete para receber feedback da comunidade.</p>
            <button className="button button--primary" onClick={openCreateModal}>
              + Nova enquete
            </button>
          </div>
        ) : (
          <div className="poll-list">
            {filteredPolls.map((entry) => (
              <article className="audit-card poll-list-card" key={entry.id}>
                <div className="poll-list-card__main">
                  <p className="eyebrow">{pollTypeLabel(entry.type)}</p>
                  <h2>{displayPollQuestion(entry)}</h2>
                  <div className="poll-list-card__meta">
                    <span className={`badge ${pollStatusTone(entry.status)}`}>{pollStatusLabel(entry.status)}</span>
                    <span>{entry.totalVotes || 0} votos</span>
                    <span>Criada em {formatDate(entry.createdAt)}</span>
                  </div>
                </div>
                <div className="poll-list-card__actions">
                  <button className="button button--primary button--sm" onClick={() => openResults(entry)}>
                    Ver resultados
                  </button>
                  <div className="override-actions">
                    <button className="button button--ghost button--sm" onClick={() => openEditModal(entry)} disabled={(entry.totalVotes || 0) > 0}>
                      Editar
                    </button>
                    {entry.status === "open" ? (
                      <button className="button button--ghost button--sm" onClick={() => handleStatus(entry, "closed")} disabled={statusBusy}>
                        Fechar
                      </button>
                    ) : (
                      <button className="button button--ghost button--sm" onClick={() => handleStatus(entry, "open")} disabled={statusBusy}>
                        Abrir
                      </button>
                    )}
                    <button
                      className="button button--danger button--soft button--sm"
                      onClick={() => {
                        setDeleteTarget(entry);
                        setActiveModal("delete");
                      }}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {resultsOpen && (
        <div className="poll-results-overlay" role="presentation" onMouseDown={closeResults}>
          <aside
            className="poll-results-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="poll-results-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="poll-results-drawer__head">
              <div>
                <p className="eyebrow">{resultPoll ? pollTypeLabel(resultPoll.type) : "Resultados"}</p>
                <h2 id="poll-results-title">{resultPoll ? displayPollQuestion(resultPoll) : "Carregando resultados"}</h2>
                {resultPoll && (
                  <div className="poll-list-card__meta">
                    <span className={`badge ${pollStatusTone(resultPoll.status)}`}>{pollStatusLabel(resultPoll.status)}</span>
                    <span>Criada em {formatDate(resultPoll.createdAt)}</span>
                  </div>
                )}
              </div>
              <button className="button button--ghost button--sm" onClick={closeResults}>
                Fechar
              </button>
            </div>

            {resultsLoading ? (
              <div className="empty-state">
                <h3>Carregando resultados</h3>
                <p>Buscando votos e identificação dos participantes.</p>
              </div>
            ) : resultsError ? (
              <div className="empty-state">
                <h3>Não foi possível carregar</h3>
                <p>{resultsError}</p>
              </div>
            ) : resultPoll ? (
              <>
                <div className="poll-results-summary">
                  <div>
                    <strong>{resultPoll.totalVotes || 0}</strong>
                    <span>votos únicos</span>
                  </div>
                  <div>
                    <strong>{resultOptions.length}</strong>
                    <span>alternativas</span>
                  </div>
                  <div>
                    <strong>{leader && (leader.votes || 0) > 0 ? `${leader.percent || 0}%` : "--"}</strong>
                    <span>{leader && (leader.votes || 0) > 0 ? "na opção líder" : "sem líder ainda"}</span>
                  </div>
                </div>

                {!resultOptions.length || !(resultPoll.totalVotes || 0) ? (
                  <div className="empty-state">
                    <h3>Enquete sem votos</h3>
                    <p>Assim que usuários votarem, os resultados aparecem aqui.</p>
                  </div>
                ) : (
                  <>
                    <div className="poll-stage-section">
                      <div className="poll-stage-section__head">
                        <span>Tela 1</span>
                        <strong>{resultPoll.type === "game_request" ? "Votação do jogo" : "Resultado da enquete"}</strong>
                      </div>
                      <div className="poll-results-list">
                        {resultOptions.map((option) => {
                          const voters = option.voters || [];
                          const expanded = Boolean(expandedOptions[option.id]);
                          return (
                            <article className="poll-result-card" key={option.id}>
                              <div className="poll-result-card__top">
                                <div>
                                  <h3>{option.label}</h3>
                                  <p>{option.votes || 0} votos · {option.percent || 0}%</p>
                                </div>
                                <button
                                  className="button button--ghost button--sm"
                                  type="button"
                                  aria-expanded={expanded}
                                  onClick={() => setExpandedOptions((current) => ({ ...current, [option.id]: !current[option.id] }))}
                                >
                                  {expanded ? "Ocultar votantes" : "Ver quem votou"}
                                </button>
                              </div>
                              <div className="poll-result-bar" aria-hidden="true">
                                <span style={{ width: `${option.percent || 0}%` }}></span>
                              </div>

                              {expanded && (
                                <div className="poll-voter-list">
                                  {!voters.length ? (
                                    <p className="plain-copy">Nenhum voto registrado nesta alternativa.</p>
                                  ) : (
                                    voters.map((voter) => (
                                      <div className="poll-voter-row" key={voter.id}>
                                        <div>
                                          <strong>{voter.name || voter.email || "Usuário sem nome"}</strong>
                                          <span>{voter.email || "E-mail indisponível"}</span>
                                          {resultPoll.type === "game_request" && (
                                            <small>
                                              {voter.contributionSkipped
                                                ? "Sem contribuição"
                                                : voter.contributionMinAmount !== null || voter.contributionMaxAmount !== null
                                                  ? formatContribution({
                                                    label: voter.contributionLabel,
                                                    minAmount: voter.contributionMinAmount,
                                                    maxAmount: voter.contributionMaxAmount,
                                                  })
                                                  : "Contribuição não informada"}
                                            </small>
                                          )}
                                        </div>
                                        <div>
                                          <code title={voter.licenseKey}>Licença: {maskLicenseKey(voter.licenseKey)}</code>
                                          <span>{formatDate(voter.votedAt)}</span>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    </div>

                    {resultPoll.type === "game_request" && (
                      <div className="poll-stage-section">
                        <div className="poll-stage-section__head">
                          <span>Tela 2</span>
                          <strong>Votação de contribuição</strong>
                        </div>
                        <div className="poll-results-list">
                          {resultOptions.map((option) => {
                            const contributionResults = resultPoll.contributionResultsByOptionId?.[String(option.id)] || [];
                            return (
                              <article className="poll-result-card" key={`contribution-${option.id}`}>
                                <div className="poll-result-card__top">
                                  <div>
                                    <h3>{option.label}</h3>
                                    <p>{option.votes || 0} votos na primeira tela</p>
                                  </div>
                                </div>
                                {contributionResults.length ? (
                                  <div className="poll-contribution-results">
                                    {contributionResults.map((contributionOption) => (
                                      <div className="poll-contribution-result" key={contributionOption.id}>
                                        <span>{formatContribution(contributionOption)}</span>
                                        <em>{contributionOption.votes || 0} votos · {contributionOption.percent || 0}%</em>
                                        <div className="poll-result-bar" aria-hidden="true">
                                          <span style={{ width: `${contributionOption.percent || 0}%` }}></span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="plain-copy">Nenhum voto registrado na segunda tela para este jogo.</p>
                                )}
                              </article>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : null}
          </aside>
        </div>
      )}

      {activeModal === "upsert" && (
        <Modal
          title={draft.mode === "edit" ? "Editar enquete" : "Nova enquete"}
          subtitle="Configure até 3 alternativas. Em pedido de jogo, a segunda etapa pergunta sobre contribuição."
          onClose={() => !saveBusy && setActiveModal(null)}
          closeDisabled={saveBusy}
          actions={
            <>
              <button className="button button--ghost" onClick={() => setActiveModal(null)} disabled={saveBusy}>
                Cancelar
              </button>
              <button className="button button--primary" onClick={handleSave} disabled={saveBusy}>
                {saveBusy ? "Salvando..." : "Salvar enquete"}
              </button>
            </>
          }
        >
          <div className="field-grid">
            <label className="field">
              <span>Tipo</span>
              <select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))}>
                <option value="basic">Básica</option>
                <option value="game_request">Pedido de jogo</option>
              </select>
            </label>

            {draft.type === "game_request" ? (
              <div className="premium-upload-box field--wide">
                <div>
                  <strong>Pergunta fixa</strong>
                  <p>{GAME_REQUEST_FIXED_QUESTION}</p>
                </div>
              </div>
            ) : (
              <label className="field field--wide">
                <span>Pergunta</span>
                <input
                  value={draft.question}
                  onChange={(event) => setDraft((current) => ({ ...current, question: event.target.value }))}
                  placeholder="Você está feliz com o Merlin?"
                  autoFocus
                />
              </label>
            )}
          </div>

          <div className="premium-upload-box">
            <div>
              <strong>Alternativas</strong>
              <p>Use de 2 a 3 opções. Em pedido de jogo, informe apenas o nome que aparecerá para o usuário.</p>
            </div>
          </div>

          <div className="field-grid">
            {draft.options.map((option, index) => (
              <label className="field" key={index}>
                <span>{`Alternativa ${index + 1}`}</span>
                <input
                  value={option.label}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    options: current.options.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, label: event.target.value } : item
                    ),
                  }))}
                  placeholder={draft.type === "game_request" ? requestGamePlaceholder(index) : basicOptionPlaceholder(index)}
                />
              </label>
            ))}
          </div>

          {draft.type === "game_request" && (
            <>
              <div className="premium-upload-box">
                <div>
                  <strong>Contribuição opcional</strong>
                  <p>A opção "Sem contribuição" é fixa. Configure até 3 faixas com valor mínimo e máximo.</p>
                </div>
              </div>
              <div className="premium-upload-box">
                <div>
                  <strong>Sem contribuição</strong>
                  <p>Essa opção sempre aparece primeiro para o usuário.</p>
                </div>
              </div>
              <div className="field-grid">
                {draft.contributionOptions.map((option, index) => (
                  <label className="field" key={index}>
                    <span>{`Faixa ${index + 1}`}</span>
                    <div className="split-inputs">
                      <input
                        value={option.minAmount}
                        onChange={(event) => setDraft((current) => ({
                          ...current,
                          contributionOptions: current.contributionOptions.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, minAmount: event.target.value } : item
                          ),
                        }))}
                        inputMode="numeric"
                        placeholder="Mínimo"
                      />
                      <input
                        value={option.maxAmount}
                        onChange={(event) => setDraft((current) => ({
                          ...current,
                          contributionOptions: current.contributionOptions.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, maxAmount: event.target.value } : item
                          ),
                        }))}
                        inputMode="numeric"
                        placeholder="Máximo"
                      />
                    </div>
                    <small>{formatContribution({
                      minAmount: Number(option.minAmount || 0),
                      maxAmount: Number(option.maxAmount || 0),
                    })}</small>
                  </label>
                ))}
              </div>
            </>
          )}
        </Modal>
      )}

      {activeModal === "delete" && deleteTarget && (
        <Modal
          title="Excluir enquete"
          subtitle="Esta ação remove a enquete e os votos vinculados a ela."
          onClose={() => !deleteBusy && setActiveModal(null)}
          closeDisabled={deleteBusy}
          actions={
            <>
              <button className="button button--ghost" onClick={() => setActiveModal(null)} disabled={deleteBusy}>
                Cancelar
              </button>
              <button className="button button--danger" onClick={handleDelete} disabled={deleteBusy}>
                {deleteBusy ? "Excluindo..." : "Excluir enquete"}
              </button>
            </>
          }
        >
          <p className="plain-copy">{displayPollQuestion(deleteTarget)}</p>
        </Modal>
      )}
    </section>
  );
}
