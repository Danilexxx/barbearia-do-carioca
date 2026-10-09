const form = document.querySelector("#adminLoginForm");
const password = document.querySelector("#adminPassword");
const message = document.querySelector("#adminLoginMessage");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "Validando...";
  try {
    const response = await fetch("../api/auth.php?action=login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ user: "admin", pass: password.value })
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result?.ok) {
      window.location.assign("../?admin=1");
      return;
    }
    message.textContent = result?.error === "LOCKED_OUT"
      ? "Muitas tentativas. Aguarde e tente novamente."
      : "Senha incorreta.";
  } catch {
    message.textContent = "Não foi possível conectar ao servidor.";
  }
});
