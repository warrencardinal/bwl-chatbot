(function () {
  if (window.__bwlChatLoaded) return;
  window.__bwlChatLoaded = true;

  var script = document.currentScript;
  var API = new URL(script.src).origin;
  var COLOR = script.getAttribute("data-color") || "#1f2a44";
  var GREETING =
    "Hi, I can help you reach Brandi Wolfe Law or set up a consultation. What can we help you with?";
  var DISCLAIMER =
    "Automated assistant. Not legal advice. Chatting does not create an attorney-client relationship. Please don't share confidential details here.";
  var STORE = "bwlchat_v1";

  function start() {

  // ---------- state ----------
  var state = load() || { messages: [], session: null };
  var busy = false;

  function load() {
    try {
      return JSON.parse(sessionStorage.getItem(STORE));
    } catch (e) {
      return null;
    }
  }
  function save() {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(state));
    } catch (e) {}
  }

  // ---------- UI ----------
  var host = document.createElement("div");
  host.id = "bwl-chat";
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: "open" });

  root.innerHTML =
    "<style>" +
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}" +
    ".btn{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;background:" + COLOR + ";color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center}" +
    ".btn svg{width:28px;height:28px}" +
    ".panel{position:fixed;right:20px;bottom:92px;z-index:2147483000;width:370px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 120px);background:#fff;color:#1d2433;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden}" +
    ".panel.open{display:flex}" +
    ".head{background:" + COLOR + ";color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between}" +
    ".head b{font-size:15px}" +
    ".x{background:none;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:0 4px}" +
    ".disc{font-size:11px;line-height:1.4;color:#5b6375;background:#f4f5f8;padding:8px 14px;border-bottom:1px solid #e4e7ee}" +
    ".log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px}" +
    ".m{max-width:85%;padding:9px 12px;border-radius:12px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}" +
    ".a{background:#f1f3f7;align-self:flex-start;border-bottom-left-radius:4px}" +
    ".u{background:" + COLOR + ";color:#fff;align-self:flex-end;border-bottom-right-radius:4px}" +
    ".a a{color:inherit;font-weight:600}" +
    ".err{font-size:12px;color:#b42318;align-self:center;text-align:center}" +
    ".typing{color:#6b7385;font-size:13px;align-self:flex-start;padding:4px 2px}" +
    "form{display:flex;gap:8px;padding:10px;border-top:1px solid #e4e7ee}" +
    "textarea{flex:1;resize:none;height:42px;max-height:110px;border:1px solid #cfd4de;border-radius:10px;padding:10px 12px;font-size:14px;color:#1d2433;outline:none}" +
    "textarea:focus{border-color:" + COLOR + "}" +
    ".send{border:0;border-radius:10px;padding:0 14px;background:" + COLOR + ";color:#fff;font-size:14px;cursor:pointer}" +
    ".send:disabled{opacity:.5;cursor:default}" +
    "@media (max-width:480px){.panel{right:0;bottom:0;width:100vw;max-width:100vw;height:100%;max-height:100%;border-radius:0}.btn.hide{display:none}}" +
    "</style>" +
    '<button class="btn" aria-label="Open chat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>' +
    '<div class="panel" role="dialog" aria-label="Chat with Brandi Wolfe Law">' +
    '<div class="head"><b>Brandi Wolfe Law</b><button class="x" aria-label="Close chat">&times;</button></div>' +
    '<div class="disc"></div>' +
    '<div class="log" aria-live="polite"></div>' +
    '<form><textarea placeholder="Type your message" aria-label="Message" maxlength="2000"></textarea><button class="send" type="submit">Send</button></form>' +
    "</div>";

  var btn = root.querySelector(".btn");
  var panel = root.querySelector(".panel");
  var log = root.querySelector(".log");
  var form = root.querySelector("form");
  var input = root.querySelector("textarea");
  var sendBtn = root.querySelector(".send");
  root.querySelector(".disc").textContent = DISCLAIMER;

  btn.addEventListener("click", function () {
    toggle(!panel.classList.contains("open"));
  });
  root.querySelector(".x").addEventListener("click", function () {
    toggle(false);
  });

  function toggle(open) {
    panel.classList.toggle("open", open);
    btn.classList.toggle("hide", open);
    if (open) {
      render();
      input.focus();
    }
  }

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || busy) return;
    input.value = "";
    state.messages.push({ role: "user", content: text });
    save();
    render();
    send();
  });

  function linkify(el, text) {
    var parts = text.split(/(https?:\/\/[^\s)]+)/g);
    parts.forEach(function (p, i) {
      if (i % 2 === 1) {
        var a = document.createElement("a");
        a.href = p;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = p;
        el.appendChild(a);
      } else if (p) {
        el.appendChild(document.createTextNode(p));
      }
    });
  }

  function bubble(role, text) {
    var d = document.createElement("div");
    d.className = "m " + (role === "user" ? "u" : "a");
    if (role === "user") d.textContent = text;
    else linkify(d, text);
    log.appendChild(d);
  }

  function render(extra) {
    log.textContent = "";
    bubble("assistant", GREETING);
    state.messages.forEach(function (m) {
      bubble(m.role, m.content);
    });
    if (busy) {
      var t = document.createElement("div");
      t.className = "typing";
      t.textContent = "Typing...";
      log.appendChild(t);
    }
    if (extra) {
      var er = document.createElement("div");
      er.className = "err";
      er.textContent = extra;
      log.appendChild(er);
    }
    sendBtn.disabled = busy;
    log.scrollTop = log.scrollHeight;
  }

  // ---------- network ----------
  function post(path, body) {
    return fetch(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().then(function (d) {
        d._status = r.status;
        return d;
      });
    });
  }

  function turnstileToken(siteKey) {
    return new Promise(function (resolve, reject) {
      function run() {
        var box = document.createElement("div");
        box.style.cssText = "position:fixed;right:20px;bottom:660px;z-index:2147483001";
        document.body.appendChild(box);
        window.turnstile.render(box, {
          sitekey: siteKey,
          appearance: "interaction-only",
          callback: function (tok) {
            box.remove();
            resolve(tok);
          },
          "error-callback": function () {
            box.remove();
            reject(new Error("turnstile"));
          },
        });
      }
      if (window.turnstile) return run();
      var s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = run;
      s.onerror = function () {
        reject(new Error("turnstile"));
      };
      document.head.appendChild(s);
    });
  }

  function getSession() {
    if (state.session) return Promise.resolve(state.session);
    return fetch(API + "/config")
      .then(function (r) {
        return r.json();
      })
      .then(function (cfg) {
        return cfg.turnstileSiteKey ? turnstileToken(cfg.turnstileSiteKey) : null;
      })
      .then(function (tok) {
        return post("/session", { turnstileToken: tok });
      })
      .then(function (d) {
        if (!d.session) throw new Error(d.error || "session");
        state.session = d.session;
        save();
        return d.session;
      });
  }

  function restoreLast() {
    var last = state.messages.pop();
    if (last && last.role === "user") input.value = last.content;
    save();
  }

  function send(retried) {
    busy = true;
    render();
    getSession()
      .then(function (session) {
        return post("/chat", { session: session, messages: state.messages, page: location.href });
      })
      .then(function (d) {
        if (d._status === 401 && !retried) {
          state.session = null;
          save();
          busy = false;
          return send(true);
        }
        busy = false;
        if (d.reply) {
          state.messages.push({ role: "assistant", content: d.reply });
          save();
          render();
        } else {
          restoreLast();
          render(d.error || "Something went wrong. Please call (210) 571-0400.");
        }
      })
      .catch(function () {
        busy = false;
        restoreLast();
        render("Couldn't connect. Please call (210) 571-0400.");
      });
  }
  }

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
