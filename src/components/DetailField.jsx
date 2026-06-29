import React from "react";
export default function DetailField({ label, value, wide = false, valueClassName = "", title }) {
  return (
    <div className={`detail-field ${wide ? "detail-field--wide" : ""}`}>
      <span>{label}</span>
      <strong className={valueClassName} title={title || value || "--"}>
        {value || "--"}
      </strong>
    </div>
  );
}
