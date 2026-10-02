const API_URL = "/api/public/votacao/games";
const VOTE_URL = "/api/public/votacao/votes";
const REMOVE_URL = "/api/public/votacao/votes/remove";
const CATEGORIES = ["Todos", "Mais votados", "Ação", "Aventura", "RPG", "Estratégia", "Simulação", "Outros"];
const state = { games: [], remainingToday: 3, ipRemainingToday: 3, ipLocked: false, voteDay: null, loading: false, view: "indisponiveis", category: "Todos", search: "", busy: null };
const list = document.querySelector("#game-list");
const status = document.querySelector("#catalog-status");
const empty = document.querySelector("#empty-state");
const filters = document.querySelector(".filters");
const extraFilters = document.querySelector("#extra-filters");
const moreFilters = document.querySelector(".more-filters");
const menuToggle = document.querySelector(".menu-toggle");
const mobileNav = document.querySelector("#mobile-nav");
const announcement = document.querySelector("#vote-announcement");
const networkStatus = document.querySelector("#network-status");
const tabs = [...document.querySelectorAll(".vote-tab")];
const votePanel = document.querySelector("#vote-panel");
const priceFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
});

function currentVoteDay() {
  const parts = Object.fromEntries(dayFormat.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function normalize(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function price(cents) {
  return priceFormat.format(cents / 100);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function iconHeart(filled) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("heart-icon");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z");
  if (filled) path.setAttribute("fill", "currentColor");
  svg.append(path);
  return svg;
}

function renderFilters() {
  filters.replaceChildren();
  extraFilters.replaceChildren();
  moreFilters.classList.toggle("is-active", CATEGORIES.indexOf(state.category) > 3);
  CATEGORIES.forEach((category, index) => {
    const button = el("button", "filter-chip", category);
    button.type = "button";
    button.dataset.category = category;
    button.setAttribute("aria-pressed", String(state.category === category));
    if (state.category === category) button.classList.add("is-active");
    button.addEventListener("click", () => {
      state.category = category;
      renderFilters();
      renderGames();
      extraFilters.hidden = true;
      moreFilters.setAttribute("aria-expanded", "false");
    });
    filters.append(button);
    if (index > 3) extraFilters.append(button.cloneNode(true));
  });
  extraFilters.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.category = button.dataset.category;
      renderFilters();
      renderGames();
      extraFilters.hidden = true;
      moreFilters.setAttribute("aria-expanded", "false");
    });
  });
}

function renderGame(game) {
  const row = el("article", "game-row");
  row.dataset.appid = game.appid;
  const image = el("img", "game-image");
  image.src = game.image;
  image.alt = `Capa de ${game.name}`;
  image.loading = "lazy";
  image.width = 138;
  image.height = 65;
  image.addEventListener("error", () => { image.style.visibility = "hidden"; }, { once: true });
  row.append(image);

  const details = el("div", "game-details");
  details.append(el("h3", "game-name", game.name));
  const tags = el("div", "game-tags");
  game.genres.forEach((genre) => tags.append(el("span", "game-tag", genre)));
  details.append(tags);
  row.append(details);

  if (game.discount > 0) row.append(el("span", "discount", `-${game.discount}%`));
  else row.append(el("span", "discount discount--empty", ""));

  const prices = el("div", "game-prices");
  prices.title = "Preço na seleção original; confirme o valor atual na Steam.";
  prices.append(el("strong", "current-price", game.currentPrice === null ? "Sem preço" : price(game.currentPrice)));
  if (game.currentPrice !== null && game.originalPrice > game.currentPrice) prices.append(el("s", "original-price", price(game.originalPrice)));
  row.append(prices);

  const votes = el("div", "game-votes");
  votes.append(el("strong", "vote-count", new Intl.NumberFormat("pt-BR").format(game.votes)));
  votes.append(el("span", "vote-caption", game.votes === 1 ? "voto" : "votos"));
  row.append(votes);

  const button = el("button", "vote-button");
  button.type = "button";
  if (!game.voted) button.append(iconHeart(false));
  button.append(el("span", "", game.voted ? "Remover" : "Votar"));
  button.setAttribute("aria-label", `${game.voted ? "Remover voto em" : "Votar em"} ${game.name}`);
  button.disabled = state.busy !== null || (!game.voted && (state.remainingToday === 0 || state.ipRemainingToday === 0));
  if (game.voted) button.classList.add("is-voted");
  button.addEventListener("click", () => game.voted ? removeVote(game.appid) : submitVote(game.appid));
  row.append(button);
  return row;
}

function renderGames() {
  networkStatus.hidden = state.ipRemainingToday > 0 || state.remainingToday === 0;
  networkStatus.textContent = state.ipLocked
    ? "Outra sessão já votou por esta rede hoje. Quem votou nesta sessão ainda pode remover um voto."
    : "Esta rede atingiu 3 votos hoje. Remova um dos votos de hoje para liberar uma escolha.";
  const topView = state.category === "Mais votados";
  const ordered = state.games
    .filter((game) => (game.source === "Correção") === (state.view === "correcoes"))
    .filter((game) => state.category === "Todos" || topView || game.genres.includes(state.category))
    .filter((game) => normalize(game.name).includes(normalize(state.search)))
    .filter((game) => !topView || game.votes > 0)
    .sort(topView
      ? (a, b) => b.votes - a.votes || (a.currentPrice ?? Infinity) - (b.currentPrice ?? Infinity)
      : (a, b) => b.votes - a.votes
        || (a.currentPrice ?? Infinity) - (b.currentPrice ?? Infinity));
  const games = topView ? ordered.slice(0, 10) : state.view === "correcoes" ? ordered : ordered.reverse();
  list.replaceChildren(...games.map(renderGame));
  empty.hidden = games.length > 0;
  empty.textContent = topView && !state.search ? "Ainda não há jogos votados." : "Nenhum jogo encontrado.";
}

function selectView(view) {
  if (view === state.view) return;
  state.view = view;
  state.category = "Todos";
  state.search = "";
  document.querySelector("#game-search").value = "";
  for (const tab of tabs) {
    const selected = tab.dataset.view === view;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected) votePanel.setAttribute("aria-labelledby", tab.id);
  }
  document.querySelector("#intro-indisponiveis").hidden = view !== "indisponiveis";
  document.querySelector("#intro-correcoes").hidden = view !== "correcoes";
  renderFilters();
  renderGames();
}

async function submitVote(appid) {
  if (state.busy || state.remainingToday === 0 || state.ipRemainingToday === 0) return;
  state.busy = appid;
  renderGames();
  try {
    const response = await fetch(VOTE_URL, {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appid }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || result.error || "Não foi possível registrar seu voto.");
    const game = state.games.find((item) => item.appid === appid);
    game.votes = result.votes;
    game.voted = true;
    state.remainingToday = result.remainingToday;
    state.ipRemainingToday = result.ipRemainingToday;
    state.ipLocked = result.ipLocked;
    announcement.textContent = `Voto em ${game.name} registrado. Restam ${state.remainingToday} votos hoje.`;
    status.hidden = true;
  } catch (error) {
    status.textContent = error.message || "Não foi possível registrar seu voto. Tente novamente.";
    status.hidden = false;
  } finally {
    state.busy = null;
    renderGames();
  }
}

async function removeVote(appid) {
  if (state.busy) return;
  state.busy = appid;
  renderGames();
  try {
    const response = await fetch(REMOVE_URL, {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appid }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || result.error || "Não foi possível remover o voto.");
    const game = state.games.find((item) => item.appid === appid);
    game.voted = false;
    game.votes = result.votes;
    state.remainingToday = result.remainingToday;
    state.ipRemainingToday = result.ipRemainingToday;
    state.ipLocked = result.ipLocked;
    announcement.textContent = `Voto em ${game.name} removido. Você tem ${state.remainingToday} escolhas disponíveis hoje.`;
    status.hidden = true;
  } catch (error) {
    status.textContent = error.message || "Não foi possível remover o voto. Tente novamente.";
    status.hidden = false;
  } finally {
    state.busy = null;
    renderGames();
  }
}

async function loadGames() {
  if (state.loading) return;
  state.loading = true;
  status.textContent = "Carregando jogos...";
  status.hidden = false;
  try {
    const response = await fetch(API_URL, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível carregar a votação.");
    const result = await response.json();
    state.games = result.games.filter((game) => game.available);
    state.remainingToday = result.remainingToday;
    state.ipRemainingToday = result.ipRemainingToday;
    state.ipLocked = result.ipLocked;
    state.voteDay = result.voteDay;
    status.hidden = true;
    renderGames();
  } catch (error) {
    status.textContent = error.message || "Não foi possível carregar a votação.";
  } finally {
    state.loading = false;
  }
}

function refreshVotingDay() {
  if (state.voteDay && state.voteDay !== currentVoteDay() && !state.busy) loadGames();
}

document.querySelector("#game-search").addEventListener("input", (event) => {
  state.search = event.target.value;
  renderGames();
});
tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectView(tab.dataset.view));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    selectView(tabs[next].dataset.view);
    tabs[next].focus();
  });
});
moreFilters.addEventListener("click", () => {
  extraFilters.hidden = !extraFilters.hidden;
  moreFilters.setAttribute("aria-expanded", String(!extraFilters.hidden));
});
menuToggle.addEventListener("click", () => {
  mobileNav.hidden = !mobileNav.hidden;
  menuToggle.setAttribute("aria-expanded", String(!mobileNav.hidden));
  menuToggle.setAttribute("aria-label", mobileNav.hidden ? "Abrir menu" : "Fechar menu");
});
mobileNav.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    mobileNav.hidden = true;
    menuToggle.setAttribute("aria-expanded", "false");
  }
});
renderFilters();
loadGames();
setInterval(refreshVotingDay, 5000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshVotingDay();
});
