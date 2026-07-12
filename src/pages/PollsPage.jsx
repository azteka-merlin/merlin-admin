import React, { useMemo, useState } from "react";
import Modal from "../components/Modal";

const GAME_REQUEST_FIXED_QUESTION = "Qual jogo você quer no Premium?";

function createEmptyPollDraft() {
  return {
    mode: "create",
    id: null,
    type: "basic",
    question: "",
    options: [
      { label: "" },
      { label: "" },
      { label: "" },
    ],
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
      return {
        ...option,
        label: existing?.label || "",
      };
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
  const question = type === "game_request"
    ? GAME_REQUEST_FIXED_QUESTION
    : String(draft.question || "").trim();
  if (!question) throw new Error("Informe a pergunta da enquete.");

  const options = draft.options
    .map((option) => ({
      label: String(option.label || "").trim(),
    }))
    .filter((option) => option.label);

  if (options.length < 2 || options.length > 3) {
    throw new Error("Informe 2 ou 3 alternativas.");
  }

  const payload = {
    type,
    question,
    options,
  };

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
  return entry.type === "game_request" ? GAME_REQUEST_FIXED_QUESTION : entry.question;
}

export default function PollsPage({
  polls,
  loadingPolls,
  pollSearch,
  setPollSearch,
  loadPolls,
  savePoll,
  setPollStatus,
  deletePoll,
  busyAction,
  notify,
}) {
  const [activeModal, setActiveModal] = useState(null);
  const [draft, setDraft] = useState(createEmptyPollDraft());
  const [deleteTarget, setDeleteTarget] = useState(null);

  const filteredPolls = useMemo(() => {
    const query = pollSearch.trim().toLowerCase();
    return polls.filter((poll) => {
      if (!query) return true;
      return [
        displayPollQuestion(poll),
        poll.type,
        poll.status,
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
            <h3>Nenhuma enquete encontrada</h3>
            <p>Crie a primeira enquete ou ajuste a busca.</p>
          </div>
        ) : (
          <div className="premium-grid">
            {filteredPolls.map((entry) => (
              <article className="audit-card premium-card" key={entry.id}>
                <div className="audit-card__head premium-card__head">
                  <div className="premium-card__summary">
                    <p className="eyebrow">{entry.type === "game_request" ? "Pedido de jogo" : "Básica"}</p>
                    <h2>{displayPollQuestion(entry)}</h2>
                    <p className="premium-card__title">{entry.totalVotes || 0} votos</p>
                  </div>

                  <div className="override-actions premium-card__actions">
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

                <div className="audit-card__body">
                  <dl className="audit-card__meta premium-card__meta premium-card__meta--single">
                    <div>
                      <dt>Status</dt>
                      <dd>
                        <span className={`badge ${entry.status === "open" ? "badge--emerald" : "badge--muted"}`}>
                          {entry.status === "open" ? "Aberta" : entry.status === "closed" ? "Fechada" : "Rascunho"}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>Criada em</dt>
                      <dd>{formatDate(entry.createdAt)}</dd>
                    </div>
                  </dl>

                  <div className="poll-result-list">
                    {(entry.options || []).map((option) => (
                      <div className="poll-result-row" key={option.id}>
                        <span>{option.label}</span>
                        <strong>{option.votes || 0} votos</strong>
                        <div className="poll-result-bar" aria-hidden="true">
                          <span style={{ width: `${option.percent || 0}%` }}></span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {entry.type === "game_request" && entry.viewer?.optionId && (
                    <p className="plain-copy">Resultados de contribuição aparecem no launcher após o voto do usuário.</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

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
              <React.Fragment key={index}>
                <label className="field">
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
              </React.Fragment>
            ))}
          </div>

          {draft.type === "game_request" && (
            <>
              <div className="premium-upload-box">
                <div>
                  <strong>Contribuição opcional</strong>
                  <p>A opção “Sem contribuição” é fixa. Configure até 3 faixas com valor mínimo e máximo.</p>
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
