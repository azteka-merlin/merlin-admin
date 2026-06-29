import React from "react";
import BrandMark from "./BrandMark";

export default function LoginScreen({ loginState, showPassword, setShowPassword, setLoginState, handleLogin }) {
  return (
    <div className="app">
      <section className="login">
        <div className="login__glow login__glow--left"></div>
        <div className="login__glow login__glow--right"></div>
        <form className="login__card" onSubmit={handleLogin}>
          <BrandMark />
          <p className="eyebrow">Merlin Admin</p>
          <h1>Acesso administrativo</h1>
          <p className="login__text">Gerenciamento de licenças do Merlin API.</p>

          <label className="field">
            <span>Usuário</span>
            <input
              value={loginState.username}
              onChange={(event) => setLoginState((current) => ({ ...current, username: event.target.value.toLowerCase(), error: "" }))}
              placeholder="Digite seu usuário"
              autoComplete="username"
              autoCapitalize="none"
            />
          </label>

          <label className="field">
            <span>Senha</span>
            <div className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                value={loginState.password}
                onChange={(event) => setLoginState((current) => ({ ...current, password: event.target.value, error: "" }))}
                placeholder="Digite sua senha"
                autoComplete="current-password"
              />
              <button
                type="button"
                className="password-field__toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                title={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                <span className={`password-eye ${showPassword ? "is-open" : ""}`} aria-hidden="true"></span>
              </button>
            </div>
            <div className="checkbox-field">
              <input
                type="checkbox"
                checked={loginState.rememberMe}
                onChange={(event) => setLoginState((current) => ({ ...current, rememberMe: event.target.checked }))}
              />
              <span>Manter conectado por mais tempo neste dispositivo</span>
            </div>
          </label>

          {loginState.error && <p className="login__error">{loginState.error}</p>}

          <button className="button button--primary button--block" type="submit" disabled={loginState.submitting}>
            {loginState.submitting ? "Entrando..." : "Entrar no painel"}
          </button>
        </form>
      </section>
    </div>
  );
}
