import React from "react";

export default function AdminTabs({ id, label, tabs, value, onChange }) {
  const refs = React.useRef([]);
  function move(event, index) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    refs.current[next]?.focus();
    onChange(tabs[next].value);
  }
  return <div className="billing-mail-tabs admin-tabs" role="tablist" aria-label={label}>
    {tabs.map((tab, index) => <button type="button" key={tab.value} id={`${id}-tab-${tab.value}`} role="tab"
      aria-selected={value === tab.value} aria-controls={`${id}-panel-${tab.value}`} tabIndex={value === tab.value ? 0 : -1}
      className={value === tab.value ? "is-active" : ""} ref={(node) => { refs.current[index] = node; }}
      onKeyDown={(event) => move(event, index)} onClick={() => onChange(tab.value)}>{tab.label}</button>)}
  </div>;
}
