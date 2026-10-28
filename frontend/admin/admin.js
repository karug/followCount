const API = "/api/admin";

const SECRET_LABELS = {
    youtubeApiKey: "YouTube: clave de API",
    githubToken: "GitHub: token",
    twitchClientId: "Twitch: Client ID",
    twitchClientSecret: "Twitch: Client Secret",
    xBearerToken: "X: Bearer token",
    facebookAccessToken: "Facebook: token de acceso",
    instagramAccessToken: "Instagram: token de acceso",
    facebookAppId: "Meta: App ID",
    facebookAppSecret: "Meta: App Secret"
};

const SECRET_NAMES = Object.keys(SECRET_LABELS);

const CHANNEL_TYPES = ["youtube", "github", "instagram", "tiktok", "twitch", "x", "facebook"];

const ALERT_TEXTS = {
    "meta-token-invalid": "Un token de Meta (Instagram o Facebook) no es válido.",
    "meta-token-expiring": "Un token de Meta caduca en pocos días.",
    "channel-failing": "Un canal lleva más de 24 horas fallando.",
    "undervoltage": "La Pi detecta falta de tensión: revisa la fuente de alimentación."
};

const ACTIONS = [
    { name: "restart-kiosk", label: "Reiniciar pantalla", confirm: "¿Reiniciar la pantalla del kiosko?", restarts: false },
    { name: "restart-backend", label: "Reiniciar backend", confirm: "¿Reiniciar el backend?", restarts: true },
    { name: "reboot", label: "Reiniciar Pi", confirm: "¿Reiniciar la Pi? Se perderá la conexión unos minutos.", restarts: true }
];

const root = document.getElementById("root");
const logoutButton = document.getElementById("logoutButton");

let draft = null;

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

// Builds elements with the DOM API only: server data never goes through innerHTML.
function h(tag, props = {}, ...children) {

    const element = document.createElement(tag);

    for (const [key, value] of Object.entries(props)) {

        if (key === "class") {
            element.className = value;
        } else if (key === "value") {
            element.value = value;
        } else if (key.startsWith("on")) {
            element.addEventListener(key.slice(2), value);
        } else if (value !== undefined && value !== null && value !== false) {
            element.setAttribute(key, value === true ? "" : value);
        }

    }

    for (const child of children.flat()) {

        if (child !== null && child !== undefined && child !== false) {
            element.append(child);
        }

    }

    return element;

}

class Unauthorized extends Error {}

// Every body is JSON with its content type: the server rejects anything else (CSRF guard).
async function api(method, path, body) {

    const options = {
        method,
        credentials: "same-origin",
        headers: {}
    };

    if (method !== "GET") {

        options.headers["Content-Type"] = "application/json";

        options.body = JSON.stringify(body ?? {});

    }

    const response = await fetch(`${API}${path}`, options);

    let data = null;

    try {
        data = await response.json();
    } catch (error) {
        data = null;
    }

    const isAuthRoute = path === "/login" || path === "/setup";

    if (response.status === 401 && !isAuthRoute) {
        throw new Unauthorized();
    }

    return { ok: response.ok, status: response.status, data };

}

function formatDate(ms) {

    if (typeof ms !== "number") {
        return "nunca";
    }

    return new Date(ms).toLocaleString("es-ES");

}

function formatDay(ms) {

    const date = new Date(ms);

    const pad = number => String(number).padStart(2, "0");

    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;

}

function setMessage(element, text, kind = "") {

    element.textContent = text;

    element.className = `message ${kind}`.trim();

}

/*
|--------------------------------------------------------------------------
| Boot and auth screens
|--------------------------------------------------------------------------
*/

async function boot() {

    stopPolling();

    logoutButton.hidden = true;

    let session;

    try {

        session = (await api("GET", "/session")).data;

    } catch (error) {

        root.replaceChildren(h("p", { class: "message error" }, "No se puede conectar con el backend."));

        return;

    }

    if (session?.needsSetup) {
        showAuthForm(true);
    } else if (!session?.authenticated) {
        showAuthForm(false);
    } else {
        await showPanel();
    }

}

function showAuthForm(isSetup) {

    const password = h("input", { type: "password", autocomplete: isSetup ? "new-password" : "current-password", required: true });

    const repeat = h("input", { type: "password", autocomplete: "new-password", required: true });

    const message = h("p", { class: "message" });

    const form = h("form", { class: "card narrow" },
        h("h2", {}, isSetup ? "Crear contraseña" : "Iniciar sesión"),
        h("label", {}, isSetup ? "Contraseña (mínimo 8 caracteres)" : "Contraseña", password),
        isSetup ? h("label", {}, "Repetir contraseña", repeat) : null,
        h("div", { class: "actions" }, h("button", { type: "submit" }, isSetup ? "Crear contraseña" : "Entrar")),
        message
    );

    form.addEventListener("submit", async event => {

        event.preventDefault();

        if (isSetup) {

            if (password.value.length < 8) {
                return setMessage(message, "La contraseña debe tener al menos 8 caracteres.", "error");
            }

            if (password.value !== repeat.value) {
                return setMessage(message, "Las contraseñas no coinciden.", "error");
            }

        }

        try {

            const result = await api("POST", isSetup ? "/setup" : "/login", { password: password.value });

            if (result.ok) {
                return boot();
            }

            setMessage(message, isSetup ? "No se ha podido crear la contraseña." : "Contraseña incorrecta.", "error");

        } catch (error) {

            setMessage(message, "Error de conexión.", "error");

        }

    });

    root.replaceChildren(form);

    password.focus();

}

logoutButton.addEventListener("click", async () => {

    try {
        await api("POST", "/logout", {});
    } catch (error) {
        // Going back to the login screen is what matters.
    }

    boot();

});

/*
|--------------------------------------------------------------------------
| Panel
|--------------------------------------------------------------------------
*/

async function showPanel() {

    let settings;

    try {

        const result = await api("GET", "/settings");

        if (!result.ok) {
            throw new Error("settings");
        }

        settings = result.data;

    } catch (error) {

        if (error instanceof Unauthorized) {
            return boot();
        }

        root.replaceChildren(h("p", { class: "message error" }, "No se han podido cargar los ajustes."));

        return;

    }

    draft = structuredClone(settings.config);

    draft.projects ??= [];

    logoutButton.hidden = false;

    root.replaceChildren(
        h("section", { id: "status" }),
        h("section", { id: "projects" }),
        h("section", { id: "secrets" }),
        h("section", { id: "general" }),
        h("section", { id: "actions" })
    );

    renderProjects();
    renderSecrets(settings.secrets);
    renderGeneral();
    renderActions();

    await refreshStatus();

}

/*
|--------------------------------------------------------------------------
| Status
|--------------------------------------------------------------------------
*/

async function refreshStatus() {

    const box = document.getElementById("status");

    if (!box) {
        return;
    }

    let status;

    try {

        const result = await api("GET", "/status");

        if (!result.ok) {
            throw new Error("status");
        }

        status = result.data;

    } catch (error) {

        if (error instanceof Unauthorized) {
            return boot();
        }

        box.replaceChildren(h("h2", {}, "Estado"), h("p", { class: "message error" }, "No se ha podido leer el estado."));

        return;

    }

    renderStatus(box, status);

}

function row(label, value, className = "") {

    return [h("dt", {}, label), h("dd", { class: className }, value)];

}

function tokenName(name) {

    if (name === "instagram") {
        return "Instagram";
    }

    return name === "facebook" ? "Facebook" : name;

}

function voltageText(system) {

    if (!system.available) {
        return "No disponible";
    }

    if (system.undervoltageNow) {
        return "Subtensión ahora";
    }

    return system.undervoltageSinceBoot ? "Subtensión desde el arranque" : "Correcto";

}

function renderStatus(box, status) {

    const alerts = status.alerts ?? [];

    const kiosk = status.kiosk ?? {};

    const system = status.system ?? {};

    const tokens = Object.entries(status.metaTokens ?? {});

    box.replaceChildren(
        h("h2", {}, "Estado"),
        ...(alerts.length === 0
            ? [h("p", { class: "good" }, "Sin alertas.")]
            : alerts.map(code => h("p", { class: "alert" }, ALERT_TEXTS[code] ?? `Alerta: ${code}`))),

        h("h3", {}, "Kiosko"),
        h("dl", {},
            row("Último latido", kiosk.lastHeartbeatAt ? new Date(kiosk.lastHeartbeatAt).toLocaleString("es-ES") : "nunca"),
            row("Congelado", kiosk.stale ? "Sí" : "No", kiosk.stale ? "bad" : "good"),
            row("Diapositiva", String(kiosk.last?.slide ?? "—"))
        ),

        h("h3", {}, "Tokens de Meta"),
        ...(tokens.length === 0
            ? [h("p", { class: "message" }, "Sin tokens de Meta.")]
            : tokens.map(([name, token]) => h("dl", {},
                row(tokenName(name),
                    token.valid === true ? "Válido" : token.valid === false ? "No válido" : "Sin comprobar",
                    token.valid === true ? "good" : token.valid === false ? "bad" : ""),
                row("Caducidad", typeof token.expiresAt === "number"
                    ? `caduca el ${formatDay(token.expiresAt)}`
                    : token.valid === true ? "no caduca" : "—"),
                row("Último error", token.error ?? "ninguno")
            ))),

        h("h3", {}, "Raspberry Pi"),
        h("dl", {},
            row("Alimentación", voltageText(system), system.undervoltageNow || system.undervoltageSinceBoot ? "bad" : ""),
            row("CPU", typeof system.armHz === "number" ? `${Math.round(system.armHz / 1e6)} MHz` : "—"),
            row("Memoria disponible", typeof system.memAvailableMb === "number" ? `${system.memAvailableMb} MB` : "—")
        ),

        h("h3", {}, "Canales"),
        h("table", {},
            h("thead", {}, h("tr", {},
                ["Proyecto", "Canal", "Último éxito", "Error"].map(title => h("th", {}, title)))),
            h("tbody", {}, (status.channels ?? []).map(channel => h("tr", {},
                h("td", {}, channel.project),
                h("td", {}, `${channel.type}${channel.id ? `: ${channel.id}` : ""}`),
                h("td", {}, formatDate(channel.lastSuccessAt)),
                h("td", {}, channel.lastError ?? "")
            )))
        ),

        h("div", { class: "actions" }, h("button", { type: "button", onclick: refreshStatus }, "Actualizar"))
    );

}

/*
|--------------------------------------------------------------------------
| Projects and accounts
|--------------------------------------------------------------------------
*/

function field(label, target, key) {

    const input = h("input", { type: "text", value: target[key] ?? "" });

    input.addEventListener("input", () => {

        if (input.value === "") {
            delete target[key];
        } else {
            target[key] = input.value;
        }

    });

    return h("label", {}, label, input);

}

function channelFields(channel) {

    switch (channel.type) {

        case "youtube":
            return [field("Channel ID", channel, "channelId")];

        case "facebook":
            return [field("Page ID", channel, "pageId"), field("Usuario", channel, "username")];

        case "instagram":
            return [field("Usuario", channel, "username"), field("Facebook Page ID (opcional)", channel, "facebookPageId")];

        default:
            return [field("Usuario", channel, "username")];

    }

}

// A primary channel whose type no longer exists would fail server validation.
function dropOrphanPrimary(project) {

    if (project.primaryChannel !== undefined
        && !project.channels.some(channel => channel.type === project.primaryChannel)) {
        delete project.primaryChannel;
    }

}

function renderChannel(project, channel, channelIndex) {

    const type = h("select", {}, CHANNEL_TYPES.map(name => h("option", { value: name, selected: name === channel.type }, name)));

    type.addEventListener("change", () => {

        channel.type = type.value;

        // Drop only the identifier fields the new type doesn't use.
        if (channel.type !== "youtube") {
            delete channel.channelId;
        }

        if (channel.type !== "facebook") {
            delete channel.pageId;
        }

        if (channel.type !== "instagram") {
            delete channel.facebookPageId;
        }

        dropOrphanPrimary(project);

        renderProjects();

    });

    const cache = h("input", { type: "number", min: "1", step: "1", value: channel.cacheSeconds ?? "" });

    cache.addEventListener("input", () => {

        if (cache.value === "") {
            delete channel.cacheSeconds;
        } else {
            channel.cacheSeconds = Number(cache.value);
        }

    });

    return h("div", { class: "channel" },
        h("div", { class: "row" },
            h("label", {}, "Tipo", type),
            channelFields(channel),
            h("label", {}, "Caché en segundos (opcional)", cache)
        ),
        h("button", {
            type: "button",
            class: "secondary",
            onclick: () => {
                project.channels.splice(channelIndex, 1);
                dropOrphanPrimary(project);
                renderProjects();
            }
        }, "Quitar canal")
    );

}

function renderProject(project, index) {

    project.channels ??= [];

    const primary = h("select", {},
        h("option", { value: "" }, "(ninguno)"),
        [...new Set(project.channels.map(channel => channel.type))]
            .map(type => h("option", { value: type, selected: type === project.primaryChannel }, type))
    );

    primary.addEventListener("change", () => {

        if (primary.value === "") {
            delete project.primaryChannel;
        } else {
            project.primaryChannel = primary.value;
        }

    });

    const move = (delta, label) => h("button", {
        type: "button",
        class: "secondary",
        disabled: index + delta < 0 || index + delta >= draft.projects.length,
        onclick: () => {
            const [item] = draft.projects.splice(index, 1);
            draft.projects.splice(index + delta, 0, item);
            renderProjects();
        }
    }, label);

    return h("div", { class: "project" },
        h("div", { class: "row" },
            field("Nombre", project, "name"),
            field("Logo (opcional)", project, "logo"),
            h("label", {}, "Canal principal", primary)
        ),
        project.channels.map((channel, channelIndex) => renderChannel(project, channel, channelIndex)),
        h("div", { class: "actions" },
            h("button", {
                type: "button",
                class: "secondary",
                onclick: () => {
                    project.channels.push({ type: "youtube" });
                    renderProjects();
                }
            }, "Añadir canal"),
            move(-1, "Subir"),
            move(1, "Bajar"),
            h("button", {
                type: "button",
                class: "danger",
                onclick: () => {
                    if (confirm(`¿Borrar el proyecto "${project.name ?? ""}"?`)) {
                        draft.projects.splice(index, 1);
                        renderProjects();
                    }
                }
            }, "Borrar proyecto")
        )
    );

}

function renderProjects(savedNote = "") {

    const box = document.getElementById("projects");

    const errors = h("ul", { class: "errors" });

    const message = h("p", { class: "message" });

    if (savedNote) {
        setMessage(message, savedNote, "ok");
    }

    box.replaceChildren(
        h("h2", {}, "Proyectos y cuentas"),
        ...draft.projects.map(renderProject),
        h("div", { class: "actions" },
            h("button", {
                type: "button",
                class: "secondary",
                onclick: () => {
                    draft.projects.push({ name: "", channels: [] });
                    renderProjects();
                }
            }, "Añadir proyecto"),
            h("button", { type: "button", onclick: () => saveConfig(errors, message) }, "Guardar")
        ),
        errors,
        message
    );

}

// Shared by the projects and general settings sections: one PUT of the whole draft.
async function saveConfig(errorsList, message) {

    errorsList.replaceChildren();

    setMessage(message, "Guardando…");

    try {

        const result = await api("PUT", "/config", { config: draft });

        if (result.ok) {

            draft = structuredClone(result.data);

            draft.projects ??= [];

            renderProjects("Guardado.");
            renderGeneral("Guardado.");

            refreshStatus();

            return;

        }

        if (result.data?.errors) {

            setMessage(message, "No se ha guardado:", "error");

            for (const text of result.data.errors) {
                errorsList.append(h("li", {}, text));
            }

            return;

        }

        setMessage(message, "No se ha podido guardar.", "error");

    } catch (error) {

        if (error instanceof Unauthorized) {
            return boot();
        }

        setMessage(message, "Error de conexión.", "error");

    }

}

/*
|--------------------------------------------------------------------------
| Secrets
|--------------------------------------------------------------------------
*/

function renderSecrets(secrets, savedNote = "", savedWarnings = []) {

    const box = document.getElementById("secrets");

    const message = h("p", { class: "message" });

    const warnings = h("ul", { class: "errors" }, savedWarnings.map(text => h("li", {}, text)));

    if (savedNote) {
        setMessage(message, savedNote, "ok");
    }

    const inputs = {};

    async function saveSecrets(payload) {

        warnings.replaceChildren();

        setMessage(message, "Guardando…");

        try {

            const result = await api("PUT", "/secrets", { secrets: payload });

            if (!result.ok) {
                return setMessage(message, result.data?.error ?? "No se han podido guardar.", "error");
            }

            renderSecrets(result.data.secrets, "Guardado.", result.data.warnings ?? []);

            refreshStatus();

        } catch (error) {

            if (error instanceof Unauthorized) {
                return boot();
            }

            setMessage(message, "Error de conexión.", "error");

        }

    }

    const fields = SECRET_NAMES.map(name => {

        const info = secrets[name];

        const input = h("input", {
            type: "password",
            autocomplete: "off",
            placeholder: info?.set ? info.masked : "sin configurar"
        });

        inputs[name] = input;

        const remove = h("button", {
            type: "button",
            class: "secondary",
            disabled: !info?.set,
            onclick: () => {

                if (confirm(`¿Borrar "${SECRET_LABELS[name]}"?`)) {
                    saveSecrets({ [name]: null });
                }

            }
        }, "Borrar");

        return h("div", { class: "row" }, h("label", {}, SECRET_LABELS[name], input), h("div", { class: "actions" }, remove));

    });

    box.replaceChildren(
        h("h2", {}, "Tokens y claves"),
        h("p", { class: "message" }, "Deja vacío lo que no quieras cambiar."),
        ...fields,
        h("div", { class: "actions" }, h("button", {
            type: "button",
            onclick: () => {

                const payload = {};

                for (const name of SECRET_NAMES) {

                    if (inputs[name].value.trim() !== "") {
                        payload[name] = inputs[name].value;
                    }

                }

                saveSecrets(payload);

            }
        }, "Guardar")),
        warnings,
        message
    );

}

/*
|--------------------------------------------------------------------------
| General settings
|--------------------------------------------------------------------------
*/

function renderGeneral(savedNote = "") {

    const box = document.getElementById("general");

    const errors = h("ul", { class: "errors" });

    const message = h("p", { class: "message" });

    if (savedNote) {
        setMessage(message, savedNote, "ok");
    }

    const number = (label, key) => {

        const input = h("input", { type: "number", min: "1", step: "1", value: draft[key] ?? "" });

        input.addEventListener("input", () => {

            if (input.value === "") {
                delete draft[key];
            } else {
                draft[key] = Number(input.value);
            }

        });

        return h("label", {}, label, input);

    };

    const transition = h("select", {},
        h("option", { value: "" }, "(por defecto)"),
        ["fade", "slide"].map(name => h("option", { value: name, selected: name === draft.transition }, name))
    );

    transition.addEventListener("change", () => {

        if (transition.value === "") {
            delete draft.transition;
        } else {
            draft.transition = transition.value;
        }

    });

    box.replaceChildren(
        h("h2", {}, "Ajustes generales"),
        h("div", { class: "row" },
            number("Segundos por diapositiva", "slideSeconds"),
            number("Segundos entre refrescos", "refreshSeconds"),
            h("label", {}, "Transición", transition)
        ),
        h("div", { class: "actions" }, h("button", { type: "button", onclick: () => saveConfig(errors, message) }, "Guardar")),
        errors,
        message
    );

}

/*
|--------------------------------------------------------------------------
| Actions
|--------------------------------------------------------------------------
*/

let pollTimer = null;

function stopPolling() {

    clearInterval(pollTimer);

    pollTimer = null;

    document.querySelector(".overlay")?.remove();

}

function waitForRestart() {

    stopPolling();

    document.body.append(h("div", { class: "overlay" }, "Reiniciando…"));

    const startedAt = Date.now();

    let sawDown = false;

    pollTimer = setInterval(async () => {

        try {

            const response = await fetch(`${API}/session`, { credentials: "same-origin", cache: "no-store" });

            // A 401 (no session) still means the server is back: boot() shows the login
            if (response.status < 500 && pollTimer !== null && (sawDown || Date.now() - startedAt >= 60000)) {
                boot();
            }

        } catch (error) {

            sawDown = true;

        }

    }, 5000);

}

function renderActions() {

    const box = document.getElementById("actions");

    const message = h("p", { class: "message" });

    box.replaceChildren(
        h("h2", {}, "Acciones"),
        h("div", { class: "actions" }, ACTIONS.map(action => h("button", {
            type: "button",
            class: "secondary",
            onclick: async () => {

                if (!confirm(action.confirm)) {
                    return;
                }

                try {

                    const result = await api("POST", `/actions/${action.name}`, {});

                    if (!result.ok) {
                        return setMessage(message, result.data?.error ?? "No se ha podido ejecutar la acción.", "error");
                    }

                    if (action.restarts) {
                        return waitForRestart();
                    }

                    setMessage(message, "Hecho.", "ok");

                } catch (error) {

                    if (error instanceof Unauthorized) {
                        return boot();
                    }

                    // The restart may cut the connection before the reply arrives.
                    if (action.restarts) {
                        return waitForRestart();
                    }

                    setMessage(message, "Error de conexión.", "error");

                }

            }
        }, action.label))),
        message
    );

}

boot();
