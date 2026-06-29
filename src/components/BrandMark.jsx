import React from "react";
import wizardLogo from "../assets/merlin-wizard.jpg";

export default function BrandMark({ small = false }) {
  return (
    <div className={`brand-mark ${small ? "brand-mark--small" : ""}`}>
      <div className="brand-mark__inner brand-mark__inner--image">
        <img src={wizardLogo} alt="Merlin Wizard" className="brand-mark__image" />
      </div>
    </div>
  );
}
