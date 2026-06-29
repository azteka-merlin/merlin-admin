import React from "react";
import BrandMark from "./BrandMark";

export default function LoadingScreen() {
  return (
    <div className="app">
      <section className="login">
        <div className="login__card">
          <BrandMark />
          <p className="eyebrow">Merlin Admin</p>
          <h1>Carregando painel</h1>
          <p className="login__text">Validando sessão administrativa.</p>
        </div>
      </section>
    </div>
  );
}
