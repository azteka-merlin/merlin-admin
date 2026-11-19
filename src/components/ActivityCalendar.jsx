import React, { useEffect, useId, useRef, useState } from "react";
import { formatDate } from "../lib/admin-ui";
import { activityBounds, addDays, dayDistance, formatMonth, monthDays, shiftMonth, todayInBrasilia } from "../lib/activity-period";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

function ActivityTimeField({ label, value, onChange }) {
  const [hour, minute] = value.split(":");
  return <fieldset className="activity-calendar__time-field">
    <legend>{label}</legend>
    <select aria-label={label + " · hora"} value={hour} onChange={event => onChange(event.target.value + ":" + minute)}>
      {HOURS.map(value => <option key={value}>{value}</option>)}
    </select>
    <span aria-hidden="true">:</span>
    <select aria-label={label + " · minutos"} value={minute} onChange={event => onChange(hour + ":" + event.target.value)}>
      {MINUTES.map(value => <option key={value}>{value}</option>)}
    </select>
  </fieldset>;
}

export default function ActivityCalendar({ period, onApply, onClose }) {
  const today = todayInBrasilia();
  const initial = period.start || today;
  const [mode, setMode] = useState(period.mode === "range" ? "range" : "day");
  const [month, setMonth] = useState(initial.slice(0, 7) + "-01");
  const [start, setStart] = useState(initial);
  const [focusedDay, setFocusedDay] = useState(initial);
  const [end, setEnd] = useState(period.end || "");
  const [startTime, setStartTime] = useState(period.startTime || "00:00");
  const [endTime, setEndTime] = useState(period.endTime || "23:59");
  const dialog = useRef(null);
  const titleId = useId();
  const dayToFocus = useRef(null);
  const waitingForEnd = mode === "range" && start && !end;
  const draft = mode === "day" ? { mode, start, startTime, endTime } : { mode, start, end };
  const valid = (mode !== "range" || Boolean(end)) && activityBounds(draft, today);
  const currentMonth = today.slice(0, 7) + "-01";
  const days = monthDays(month);
  const selectable = days.filter(day => day && !dayDisabled(day));
  const firstTabStop = selectable.includes(focusedDay) ? focusedDay : selectable[0];

  useEffect(() => {
    if (!dialog.current.open) dialog.current.showModal();
  }, []);

  useEffect(() => {
    if (dayToFocus.current) {
      dialog.current.querySelector("[data-day='" + dayToFocus.current + "']")?.focus();
      dayToFocus.current = null;
    }
  }, [focusedDay, month]);

  function dayDisabled(day) {
    return day > today || Boolean(waitingForEnd && Math.abs(dayDistance(start, day)) >= 7);
  }

  function moveDayFocus(event, day) {
    const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    const next = addDays(day, step);
    if (dayDisabled(next)) return;
    dayToFocus.current = next;
    setFocusedDay(next);
    setMonth(next.slice(0, 7) + "-01");
  }

  function selectDay(day) {
    setFocusedDay(day);
    if (!waitingForEnd) {
      setStart(day);
      setEnd("");
      return;
    }
    setStart(day < start ? day : start);
    setEnd(day < start ? start : day);
  }

  return <dialog ref={dialog} className="activity-calendar" aria-labelledby={titleId} onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
    <div className="activity-calendar__body">
      <div className="section-heading">
        <div><h2 id={titleId}>Data da atividade</h2><p className="field-grid__note">Horário de Brasília</p></div>
        <button type="button" className="button button--ghost button--sm" aria-label="Fechar calendário" onClick={() => dialog.current.close()}>×</button>
      </div>
      <div className="catalog-queue__tabs" role="group" aria-label="Tipo de seleção">
        <button type="button" className={"catalog-queue__tab " + (mode === "day" ? "is-active" : "")} aria-pressed={mode === "day"} onClick={() => { setMode("day"); setStart(start || today); setEnd(""); }}>Dia e horário</button>
        <button type="button" className={"catalog-queue__tab " + (mode === "range" ? "is-active" : "")} aria-pressed={mode === "range"} onClick={() => { if (mode === "day") { setStart(""); setEnd(""); } setMode("range"); }}>Período</button>
      </div>
      <div className="activity-calendar__month">
        <button type="button" className="button button--ghost button--sm" aria-label="Mês anterior" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <strong aria-live="polite">{formatMonth(month)}</strong>
        <button type="button" className="button button--ghost button--sm" aria-label="Próximo mês" disabled={month >= currentMonth} onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
      </div>
      <div className="activity-calendar__grid">
        {WEEKDAYS.map(day => <span className="activity-calendar__weekday" key={day} aria-hidden="true">{day}</span>)}
        {days.map((day, index) => {
          if (!day) return <span key={"blank-" + index} />;
          const endpoint = day === start || (mode === "range" && day === end);
          const interior = mode === "range" && end && day > start && day < end;
          const disabled = dayDisabled(day);
          return <button type="button" key={day} aria-label={formatDate(day)} aria-current={day === today ? "date" : undefined}
            aria-pressed={Boolean(endpoint || interior)} disabled={disabled} data-day={day}
            tabIndex={day === firstTabStop ? 0 : -1} onKeyDown={event => moveDayFocus(event, day)}
            className={"activity-calendar__day" + (endpoint ? " is-selected" : "") + (interior ? " is-in-range" : "")}
            onClick={() => selectDay(day)}>{Number(day.slice(8))}</button>;
        })}
      </div>
      {mode === "day" ? <div className="activity-calendar__times">
        <ActivityTimeField label="De" value={startTime} onChange={setStartTime} />
        <ActivityTimeField label="Até" value={endTime} onChange={setEndTime} />
      </div> : <p className="field-grid__note" aria-live="polite">{end ? formatDate(start) + " a " + formatDate(end) : start ? "Escolha a segunda data. O período pode ter até sete dias." : "Escolha a primeira data do período."}</p>}
      {mode === "day" && !valid && <p className="field-grid__note" role="alert">O horário final precisa ser igual ou posterior ao inicial.</p>}
      <div className="activity-calendar__actions">
        <button type="button" className="button button--ghost" onClick={() => dialog.current.close()}>Cancelar</button>
        <button type="button" className="button button--primary" disabled={!valid} onClick={() => { onApply(draft); dialog.current.close(); }}>Aplicar</button>
      </div>
    </div>
  </dialog>;
}
